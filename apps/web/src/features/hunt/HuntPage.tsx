import type { HuntView } from "@scour/core";
import { Ellipsis, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { LiveDot } from "../../components/Live.tsx";
import { TopBar, useShell } from "../../components/Shell.tsx";
import { Button, IconButton } from "../../components/ui/Button.tsx";
import { toast, toastError } from "../../components/ui/Toast.tsx";
import { ApiError, errorMessage } from "../../lib/api.ts";
import { live } from "../../lib/client.ts";
import { useNow } from "../../lib/clock.ts";
import { cn } from "../../lib/cn.ts";
import { isActive } from "../../lib/findings.ts";
import { relativeTime } from "../../lib/format.ts";
import { quick, spring } from "../../lib/motion.ts";
import { useDeleteHunt, useHunt, useLive } from "../../lib/queries.ts";
import { useSplitHunt } from "../../lib/useMediaQuery.ts";
import { Board } from "./Board.tsx";
import { Composer } from "./Composer.tsx";
import { Conversation } from "./Conversation.tsx";

export function HuntPage() {
  const id = Number(useParams().id);
  if (!Number.isInteger(id) || id <= 0) return <Navigate to="/" replace />;
  return <Hunt key={id} id={id} />;
}

function Hunt({ id }: { id: number }) {
  const { wide } = useShell();
  const hunt = useHunt(id);
  const state = useLive(id);

  // This page holds the hunt's stream open; leaving closes it (the agent keeps going on the server).
  useEffect(() => {
    live.retain(id);
    return () => live.release(id);
  }, [id]);

  const running = hunt.data?.running ?? false;
  useEffect(() => {
    if (running) live.ensureFollowing(id);
  }, [id, running]);

  if (hunt.isPending) return <HuntSkeleton />;
  if (hunt.isError) {
    const missing = hunt.error instanceof ApiError && hunt.error.status === 404;
    return (
      <>
        {!wide && <TopBar />}
        <div className="flex flex-1 flex-col items-start justify-center px-6 pb-[16vh] sm:px-10">
          <h1 className="text-xl font-semibold text-ink">{missing ? "This hunt is gone" : "Couldn't load this hunt"}</h1>
          <p className="mt-1.5 text-sm text-ink-2">{missing ? "It may have been deleted." : errorMessage(hunt.error)}</p>
          <div className="mt-5 flex gap-2">
            {!missing && (
              <Button variant="secondary" onClick={() => void hunt.refetch()}>
                Try again
              </Button>
            )}
            <Link
              to="/"
              className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-sm font-medium text-bg transition-colors hover:bg-white"
            >
              New hunt
            </Link>
          </div>
        </div>
      </>
    );
  }

  return <HuntScreen view={hunt.data} status={state.status} reconnecting={state.reconnecting} />;
}

function HuntScreen({ view, status, reconnecting }: { view: HuntView; status: string | null; reconnecting: boolean }) {
  const split = useSplitHunt();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [sentAt, setSentAt] = useState(0);
  const [tab, setTab] = useState<"chat" | "findings">(() => (view.findings.some(isActive) && !view.running ? "findings" : "chat"));
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!view.running) setStopping(false);
  }, [view.running]);

  const send = async () => {
    const message = text.trim();
    if (!message) return;
    setSending(true);
    try {
      await live.send(view.id, message);
      setText("");
      setSentAt(Date.now());
    } catch (err) {
      toastError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const stop = async () => {
    setStopping(true);
    try {
      await live.stop(view.id);
    } catch (err) {
      setStopping(false);
      toastError(errorMessage(err));
    }
  };

  const refine = () => {
    setTab("chat");
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const composer = (
    <Composer
      value={text}
      onChange={setText}
      onSend={send}
      onStop={stop}
      running={view.running}
      sending={sending}
      stopping={stopping}
      inputRef={inputRef}
    />
  );
  const conversation = (
    <Conversation messages={view.messages} status={status} reconnecting={reconnecting} composer={composer} sentAt={sentAt} />
  );
  const board = <Board view={view} status={status} onRefine={refine} />;
  const activeCount = view.findings.filter(isActive).length;

  return (
    <>
      <TopBar>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <h1 className="min-w-0 truncate text-[15px] font-semibold text-ink sm:text-base">{view.title}</h1>
          <HuntState running={view.running} reconnecting={reconnecting} updatedAt={view.updatedAt} />
        </div>
        <HuntMenu id={view.id} running={view.running} />
      </TopBar>

      {split ? (
        <div className="flex min-h-0 flex-1">
          <section aria-label="Conversation" className="flex w-[384px] shrink-0 flex-col border-r border-line">
            {conversation}
          </section>
          <section aria-label="Findings" className="min-w-0 flex-1 overflow-y-auto">
            {board}
          </section>
        </div>
      ) : (
        <>
          <Tabs tab={tab} onTab={setTab} count={activeCount} running={view.running} />
          <div className={cn("min-h-0 flex-1 flex-col", tab === "chat" ? "flex" : "hidden")} role="tabpanel" id="panel-chat" aria-labelledby="tab-chat">
            {conversation}
          </div>
          <div
            className={cn("min-h-0 flex-1 overflow-y-auto", tab === "findings" ? "block" : "hidden")}
            role="tabpanel"
            id="panel-findings"
            aria-labelledby="tab-findings"
          >
            {board}
          </div>
        </>
      )}
    </>
  );
}

function HuntState({ running, reconnecting, updatedAt }: { running: boolean; reconnecting: boolean; updatedAt: string }) {
  const now = useNow(30_000);
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={running ? (reconnecting ? "re" : "on") : "off"}
        initial={{ opacity: 0, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -3 }}
        transition={quick}
        className={cn("flex shrink-0 items-center gap-2 whitespace-nowrap text-[13px]", running ? "text-ink-2" : "text-ink-3 max-sm:hidden")}
      >
        {running ? (
          <>
            <LiveDot />
            {reconnecting ? "Reconnecting" : "Hunting"}
          </>
        ) : (
          `Updated ${relativeTime(updatedAt, now).toLowerCase()}`
        )}
      </motion.span>
    </AnimatePresence>
  );
}

function Tabs({
  tab,
  onTab,
  count,
  running,
}: {
  tab: "chat" | "findings";
  onTab: (t: "chat" | "findings") => void;
  count: number;
  running: boolean;
}) {
  // A dot on Findings when new ones arrive while the conversation is showing.
  const [seen, setSeen] = useState(count);
  useEffect(() => {
    if (tab === "findings") setSeen(count);
  }, [tab, count]);
  const fresh = tab === "chat" && count > seen;

  const items = [
    { id: "chat" as const, label: "Conversation" },
    { id: "findings" as const, label: "Findings" },
  ];
  return (
    <div className="shrink-0 border-b border-line px-3 py-2 sm:px-4">
      <div role="tablist" aria-label="Hunt" className="grid grid-cols-2 gap-1 rounded-full bg-surface p-1 sm:max-w-sm">
        {items.map((it) => {
          const on = tab === it.id;
          return (
            <button
              key={it.id}
              id={`tab-${it.id}`}
              role="tab"
              aria-selected={on}
              aria-controls={`panel-${it.id}`}
              onClick={() => onTab(it.id)}
              className={cn(
                "relative isolate flex h-8 items-center justify-center gap-1.5 rounded-full text-[13px] font-medium transition-colors",
                on ? "text-ink" : "text-ink-3 hover:text-ink-2",
              )}
            >
              {on && <motion.span layoutId="hunt-tab" transition={spring} className="absolute inset-0 -z-10 rounded-full bg-raised" aria-hidden />}
              {it.label}
              {it.id === "findings" && (
                <span className="tnum text-ink-3">
                  {count}
                  {fresh && <span className="ml-1 inline-block size-1.5 -translate-y-px rounded-full bg-accent align-middle" aria-label="new" />}
                </span>
              )}
              {it.id === "chat" && running && <LiveDot className="ml-0.5 size-1.5" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function HuntMenu({ id, running }: { id: number; running: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const del = useDeleteHunt();
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setConfirming(false);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <IconButton icon={Ellipsis} label="Hunt options" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)} />
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.12 } }}
            transition={quick}
            className="absolute right-0 top-full z-30 mt-1.5 w-64 origin-top-right rounded-2xl bg-raised p-1.5 shadow-[0_16px_48px_rgb(0_0_0/0.5)]"
          >
            {confirming ? (
              <div className="p-2.5">
                <p className="text-sm font-medium text-ink">Delete this hunt?</p>
                <p className="mt-1 text-[13px] leading-snug text-ink-2">Its conversation and findings go too.</p>
                <div className="mt-3 flex justify-end gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    loading={del.isPending}
                    onClick={() =>
                      del.mutate(id, {
                        onSuccess: () => {
                          toast("Hunt deleted");
                          navigate("/", { replace: true });
                        },
                      })
                    }
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                role="menuitem"
                disabled={running}
                onClick={() => setConfirming(true)}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-danger transition-colors hover:bg-hover disabled:text-ink-3 disabled:hover:bg-transparent"
              >
                <Trash2 size={15} aria-hidden />
                <span>
                  Delete hunt
                  {running && <span className="block text-xs text-ink-3">Stop the agent first</span>}
                </span>
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function HuntSkeleton() {
  const split = useSplitHunt();
  return (
    <>
      <TopBar>
        <div className="h-4 w-56 rounded-full bg-raised" />
      </TopBar>
      <div className="flex min-h-0 flex-1" aria-busy="true" aria-label="Loading hunt">
        {split && (
          <div className="flex w-[384px] shrink-0 flex-col gap-3 border-r border-line p-5">
            <div className="ml-auto h-10 w-3/4 rounded-2xl bg-raised" />
            <div className="mt-4 h-3 w-1/2 rounded-full bg-raised" />
            <div className="h-3 w-5/6 rounded-full bg-raised" />
            <div className="h-3 w-2/3 rounded-full bg-raised" />
          </div>
        )}
        <div className="grid flex-1 grid-cols-[repeat(auto-fill,minmax(228px,1fr))] content-start gap-3.5 p-5 pt-16">
          {[0, 1, 2].map((i) => (
            <div key={i} className="overflow-hidden rounded-2xl bg-surface">
              <div className="aspect-[4/3] bg-raised" />
              <div className="flex flex-col gap-2.5 p-4">
                <div className="h-6 w-24 rounded-full bg-raised" />
                <div className="h-3 w-4/5 rounded-full bg-raised" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
