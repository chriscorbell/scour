// Replies being written, one per hunt at most. Each keeps every event it has sent, so a client that
// connects late (after a reload, say) sees the whole reply from its start.
import type { SSEStreamingApi } from "hono/streaming";
import type { Activity, Finding, HuntStreamEvent, HuntSummary } from "@scour/core";

export class Reply {
  text = "";
  activity: Activity[] = [];
  readonly abort = new AbortController();
  private events: HuntStreamEvent[] = [];
  private listeners = new Set<(e: HuntStreamEvent) => void>();
  readonly huntId: number;
  readonly messageId: number;

  constructor(huntId: number, messageId: number) {
    this.huntId = huntId;
    this.messageId = messageId;
  }

  emit(e: HuntStreamEvent) {
    this.events.push(e);
    for (const fn of this.listeners) fn(e);
  }

  /** A finding was added or changed: send it, and the hunt with its new finding count. */
  finding(finding: Finding, hunt: HuntSummary) {
    this.emit({ type: "finding", finding });
    this.emit({ type: "hunt", hunt });
  }

  delta(t: string) {
    this.text += t;
    this.emit({ type: "delta", text: t });
  }

  status(text: string) {
    this.emit({ type: "status", text });
  }

  log(kind: Activity["kind"], text: string, detail: string | null = null) {
    const activity: Activity = { kind, text, detail, at: new Date().toISOString() };
    this.activity.push(activity);
    this.emit({ type: "activity", activity });
  }

  /** Chris starred or dismissed a finding mid-reply: a late client's replay should show it as it is now. */
  replaceFinding(finding: Finding) {
    this.events = this.events.map((e) => (e.type === "finding" && e.finding.id === finding.id ? { ...e, finding } : e));
  }

  /** Replays what has happened so far, then follows along. Returns the unsubscribe function. */
  subscribe(fn: (e: HuntStreamEvent) => void): () => void {
    for (const e of this.events) fn(e);
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

const replies = new Map<number, Reply>();

export const isRunning = (huntId: number) => replies.has(huntId);
export const activeReply = (huntId: number) => replies.get(huntId) ?? null;
export const addReply = (reply: Reply) => replies.set(reply.huntId, reply);
export const removeReply = (reply: Reply) => replies.delete(reply.huntId);

/** Writes a reply's events to an SSE stream until it's done or the client goes away. */
export async function followReply(reply: Reply, stream: SSEStreamingApi) {
  const queue: HuntStreamEvent[] = [];
  let wake: (() => void) | null = null;
  let closed = false;
  stream.onAbort(() => {
    closed = true;
    wake?.();
  });
  const unsubscribe = reply.subscribe((e) => {
    queue.push(e);
    wake?.();
  });
  // Comments keep the connection alive while the agent thinks.
  const ping = setInterval(() => void stream.write(": ping\n\n").catch(() => {}), 10_000);
  try {
    while (!closed) {
      const e = queue.shift();
      if (!e) {
        await new Promise<void>((resolve) => (wake = resolve));
        wake = null;
        continue;
      }
      await stream.writeSSE({ event: e.type, data: JSON.stringify(e) });
      if (e.type === "done") break;
    }
  } finally {
    clearInterval(ping);
    unsubscribe();
  }
}
