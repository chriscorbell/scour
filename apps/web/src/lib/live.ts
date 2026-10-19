// Live replies. A hunt's reply streams from the POST that started it, or from GET /stream when the page
// picks it back up. Events are merged into the cached HuntView, so every view of the hunt stays current.
// The agent keeps going on the server when a stream closes: leaving a hunt aborts only the stream.
import type { HuntStreamEvent, HuntSummary, HuntView, Message } from "@scour/core";
import type { QueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { ApiError, isAbort } from "./api.ts";
import { endpoints } from "./endpoints.ts";
import { activeCount, isPendingReply, mergeFinding } from "./findings.ts";
import { keys } from "./keys.ts";
import { readEvents } from "./sse.ts";

export interface LiveState {
  /** A stream is open for this hunt. */
  attached: boolean;
  /** What the agent is doing right now, until reply text arrives after it. */
  status: string | null;
  /** The stream dropped and is being picked back up. */
  reconnecting: boolean;
}

const IDLE: LiveState = { attached: false, status: null, reconnecting: false };

interface Stream {
  controller: AbortController;
  attachedAt: number;
  /** A followed stream replays the reply from its start: the first event resets the pending reply. */
  replaying: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Back off while reconnecting, up to 5 s between tries. */
const backoff = (attempt: number) => Math.min(5000, 800 * attempt);

export function createLive(qc: QueryClient) {
  const streams = new Map<number, Stream>();
  const states = new Map<number, LiveState>();
  const refs = new Map<number, number>();
  const releaseTimers = new Map<number, ReturnType<typeof setTimeout>>();
  const listeners = new Set<() => void>();

  const setState = (id: number, patch: Partial<LiveState>) => {
    const prev = states.get(id) ?? IDLE;
    if ((Object.keys(patch) as (keyof LiveState)[]).every((k) => prev[k] === patch[k])) return;
    states.set(id, { ...prev, ...patch });
    for (const l of listeners) l();
  };

  // ---------- Cache ----------

  const setView = (id: number, fn: (v: HuntView) => HuntView) =>
    qc.setQueryData<HuntView>(keys.hunt(id), (v) => (v ? fn(v) : v));

  const setSummary = (id: number, fn: (s: HuntSummary) => HuntSummary) =>
    qc.setQueryData<HuntSummary[]>(keys.hunts, (list) => list?.map((h) => (h.id === id ? fn(h) : h)));

  /** A newer copy of a hunt's summary: into the list (most recently updated first) and the open view. */
  const putSummary = (s: HuntSummary) => {
    qc.setQueryData<HuntSummary[]>(keys.hunts, (list) =>
      list ? [s, ...list.filter((h) => h.id !== s.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : list,
    );
    setView(s.id, (v) => ({ ...v, ...s }));
  };

  /** Keep the list's finding count in step with the board while findings stream in. */
  const syncCount = (id: number) => {
    const v = qc.getQueryData<HuntView>(keys.hunt(id));
    if (v) setSummary(id, (s) => ({ ...s, findingCount: activeCount(v) }));
  };

  const updatePending = (id: number, fn: (m: Message) => Message) =>
    setView(id, (v) => {
      const i = v.messages.findLastIndex(isPendingReply);
      if (i === -1) return v;
      const messages = v.messages.slice();
      messages[i] = fn(messages[i]!);
      return { ...v, messages };
    });

  function apply(id: number, s: Stream, e: HuntStreamEvent) {
    if (s.replaying && e.type !== "start") {
      s.replaying = false;
      updatePending(id, (m) => ({ ...m, text: "", activity: [] }));
    }
    if (states.get(id)?.reconnecting) setState(id, { reconnecting: false });

    switch (e.type) {
      case "start": {
        qc.setQueryData<HuntView>(keys.hunt(e.hunt.id), (v) => {
          const base = v ?? { ...e.hunt, messages: [], findings: [] };
          const earlier = base.messages.filter((m) => m.id !== e.message.id && m.id !== e.reply.id);
          return { ...base, ...e.hunt, messages: [...earlier, e.message, e.reply] };
        });
        if (!qc.getQueryData<HuntSummary[]>(keys.hunts)?.some((h) => h.id === e.hunt.id)) {
          qc.setQueryData<HuntSummary[]>(keys.hunts, (list) => (list ? [e.hunt, ...list] : list));
        }
        putSummary(e.hunt);
        setState(id, { status: null });
        return;
      }
      case "hunt":
        putSummary(e.hunt);
        return;
      case "status":
        setState(id, { status: e.text });
        return;
      case "activity":
        updatePending(id, (m) => ({ ...m, activity: [...m.activity, e.activity] }));
        return;
      case "delta":
        updatePending(id, (m) => ({ ...m, text: m.text + e.text }));
        setState(id, { status: null });
        return;
      case "finding":
        setView(id, (v) => ({ ...v, findings: mergeFinding(v.findings, e.finding) }));
        syncCount(id);
        return;
      case "done":
        setView(id, (v) => {
          const has = v.messages.some((m) => m.id === e.reply.id);
          const messages = has ? v.messages.map((m) => (m.id === e.reply.id ? e.reply : m)) : [...v.messages, e.reply];
          return { ...v, ...e.hunt, messages };
        });
        putSummary(e.hunt);
        setState(id, { status: null });
        return;
    }
  }

  // ---------- Streams ----------

  const alive = (id: number, s: Stream) => streams.get(id) === s && !s.controller.signal.aborted;

  function attach(id: number, s: Stream) {
    s.attachedAt = Date.now();
    const prev = streams.get(id);
    if (prev && prev !== s) prev.controller.abort();
    streams.set(id, s);
    setState(id, { attached: true });
  }

  function detach(id: number, s: Stream) {
    if (streams.get(id) !== s) return;
    streams.delete(id);
    setState(id, { attached: false, status: null, reconnecting: false });
  }

  /** The reply finished: refresh the list's order and the hunt's canonical copy. */
  function finished(id: number) {
    void qc.invalidateQueries({ queryKey: keys.hunts });
    void qc.invalidateQueries({ queryKey: keys.hunt(id) });
  }

  /** Read a stream to its end, then settle: done, or pick it back up. */
  async function pump(id: number, s: Stream, res: Response) {
    const done = await readEvents(res, (e) => {
      if (alive(id, s)) apply(id, s, e);
    });
    if (!alive(id, s)) return;
    if (done) {
      detach(id, s);
      finished(id);
    } else {
      void recover(id, s, 1);
    }
  }

  /** Follow the reply being written, replayed from its start. */
  async function follow(id: number) {
    const s: Stream = { controller: new AbortController(), attachedAt: Date.now(), replaying: true };
    attach(id, s);
    try {
      const res = await endpoints.followHunt(id, s.controller.signal);
      if (!alive(id, s)) return;
      await pump(id, s, res);
    } catch (err) {
      if (!alive(id, s) || isAbort(err)) return;
      if (err instanceof ApiError && err.status === 409) {
        // Nothing is being written any more: the saved hunt has the reply.
        detach(id, s);
        finished(id);
        return;
      }
      void recover(id, s, 1);
    }
  }

  /** The stream dropped mid-reply: load the hunt again and carry on while the agent is still going. */
  async function recover(id: number, s: Stream, attempt: number): Promise<void> {
    setState(id, { reconnecting: true });
    await sleep(backoff(attempt));
    if (!alive(id, s)) return;
    try {
      const view = await endpoints.hunt(id, s.controller.signal);
      if (!alive(id, s)) return;
      if (view.running) return void follow(id);
      qc.setQueryData(keys.hunt(id), view);
      putSummary(view);
      detach(id, s);
      void qc.invalidateQueries({ queryKey: keys.hunts });
    } catch (err) {
      if (!alive(id, s) || isAbort(err)) return;
      return recover(id, s, attempt + 1);
    }
  }

  /**
   * The polled hunt list says a hunt we're streaming isn't running: the stream may have died without
   * closing (a server restart behind a proxy). Ask the server, and settle if the reply is over.
   */
  async function verify(id: number, s: Stream) {
    try {
      const view = await endpoints.hunt(id);
      if (!alive(id, s) || view.running) return;
      s.controller.abort();
      qc.setQueryData(keys.hunt(id), view);
      putSummary(view);
      detach(id, s);
    } catch {
      // The stream's own recovery handles a server that's still away.
    }
  }

  qc.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "success" || event.query.queryKey[0] !== keys.hunts[0]) return;
    const list = event.query.state.data as HuntSummary[] | undefined;
    for (const [id, s] of streams) {
      // Skip lists that may have been fetched before this stream started.
      if (Date.now() - s.attachedAt < 6000) continue;
      if (list?.some((h) => h.id === id && !h.running)) void verify(id, s);
    }
  });

  /**
   * Post a message that starts a reply (a new hunt, or a follow-up). Resolves with the hunt's id once the
   * server took it (its `start` event); rejects if it refused, e.g. 409 while the agent is still replying.
   */
  function post(open: (signal: AbortSignal) => Promise<Response>): Promise<number> {
    return new Promise((resolve, reject) => {
      const s: Stream = { controller: new AbortController(), attachedAt: Date.now(), replaying: false };
      let id: number | null = null;
      open(s.controller.signal)
        .then((res) =>
          readEvents(res, (e) => {
            if (e.type === "start" && id == null) {
              id = e.hunt.id;
              attach(id, s);
              apply(id, s, e);
              resolve(id);
              return;
            }
            if (id != null && alive(id, s)) apply(id, s, e);
          }),
        )
        .then((done) => {
          if (id == null) return reject(new Error("The server ended the reply before it started"));
          if (!alive(id, s)) return;
          if (done) {
            detach(id, s);
            finished(id);
          } else void recover(id, s, 1);
        })
        .catch((err) => {
          if (id == null) return reject(err);
          if (alive(id, s) && !isAbort(err)) void recover(id, s, 1);
        });
    });
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    get: (id: number) => states.get(id) ?? IDLE,

    create: (text: string) => post((signal) => endpoints.createHunt(text, signal)),
    send: (id: number, text: string) => post((signal) => endpoints.sendMessage(id, text, signal)),

    /** Follow a running hunt's reply unless a stream for it is already open. */
    ensureFollowing(id: number) {
      if (!streams.has(id)) void follow(id);
    },

    async stop(id: number) {
      setState(id, { status: "Stopping" });
      await endpoints.stopHunt(id);
      // The open stream ends with `done`. Without one, the saved hunt has the stopped reply.
      if (!streams.has(id)) finished(id);
    },

    /** A page shows this hunt. Pair with release; the stream closes shortly after the last release. */
    retain(id: number) {
      refs.set(id, (refs.get(id) ?? 0) + 1);
      clearTimeout(releaseTimers.get(id));
      releaseTimers.delete(id);
    },
    release(id: number) {
      const n = Math.max(0, (refs.get(id) ?? 1) - 1);
      refs.set(id, n);
      if (n > 0) return;
      clearTimeout(releaseTimers.get(id));
      releaseTimers.set(
        id,
        setTimeout(() => {
          releaseTimers.delete(id);
          if ((refs.get(id) ?? 0) > 0) return;
          const s = streams.get(id);
          if (s) {
            s.controller.abort();
            detach(id, s);
          }
        }, 250),
      );
    },

    /**
     * A fresh copy of a hunt from the server. While its reply streams, the streamed state is newer than the
     * saved one: keep the local pending reply and any findings the server copy doesn't have yet.
     */
    reconcile(view: HuntView): HuntView {
      if (!streams.has(view.id)) return view;
      const local = qc.getQueryData<HuntView>(keys.hunt(view.id));
      if (!local) return view;
      const localById = new Map(local.messages.map((m) => [m.id, m]));
      const messages = view.messages.map((m) => (isPendingReply(m) ? (localById.get(m.id) ?? m) : m));
      for (const m of local.messages) if (!messages.some((x) => x.id === m.id)) messages.push(m);
      let findings = view.findings;
      for (const f of local.findings) {
        const server = findings.find((x) => x.id === f.id);
        if (!server || Date.parse(f.updatedAt) > Date.parse(server.updatedAt)) findings = mergeFinding(findings, f);
      }
      return { ...view, running: local.running || view.running, messages, findings };
    },

    syncCount,
    setView,
  };
}

export type Live = ReturnType<typeof createLive>;
