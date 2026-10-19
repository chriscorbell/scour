import type { Activity, Message } from "@scour/core";
import {
  ChevronDown,
  CircleAlert,
  CirclePlus,
  CircleStop,
  Eye,
  Globe,
  Images,
  Search,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { WorkingGlyph } from "../../components/Live.tsx";
import { Markdown } from "../../components/Markdown.tsx";
import { cn } from "../../lib/cn.ts";
import { plural } from "../../lib/format.ts";
import { easeOut, quick } from "../../lib/motion.ts";

interface ConversationProps {
  messages: Message[];
  status: string | null;
  reconnecting: boolean;
  /** Pinned under the messages. */
  composer: ReactNode;
  /** Bumped when Chris sends a message, to bring the newest into view. */
  sentAt: number;
}

export function Conversation({ messages, status, reconnecting, composer, sentAt }: ConversationProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [initialIds] = useState(() => new Set(messages.map((m) => m.id)));

  // Open at the newest message, and follow the reply as it grows unless Chris scrolled up to read.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    const onScroll = () => {
      atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(() => {
      if (atBottom.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(content);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!sentAt) return;
    atBottom.current = true;
    const el = scrollRef.current;
    el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [sentAt]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div ref={contentRef} className="flex flex-col gap-7 px-4 pb-6 pt-5 sm:px-5" aria-live="off">
          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={initialIds.has(m.id) ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={easeOut}
            >
              {m.role === "user" ? (
                <UserMessage message={m} />
              ) : (
                <AgentReply message={m} status={status} reconnecting={reconnecting} />
              )}
            </motion.div>
          ))}
        </div>
      </div>
      <div className="shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1 sm:px-4 sm:pb-4">{composer}</div>
    </div>
  );
}

function UserMessage({ message }: { message: Message }) {
  return (
    <div className="flex justify-end pl-10">
      <p className="whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-raised px-4 py-2.5 text-[14.5px] leading-relaxed text-ink">
        <span className="sr-only">You: </span>
        {message.text}
      </p>
    </div>
  );
}

function AgentReply({ message, status, reconnecting }: { message: Message; status: string | null; reconnecting: boolean }) {
  const pending = message.status === "pending";
  const liveText = pending
    ? reconnecting
      ? "Reconnecting"
      : (status ?? (message.text ? null : message.activity.length ? "Working" : "Starting the hunt"))
    : null;

  return (
    <div className="flex flex-col gap-3">
      <span className="sr-only">Agent:</span>
      {message.activity.length > 0 && <ActivityLog activity={message.activity} running={pending} />}
      {message.text && <Markdown text={message.text} streaming={pending && !liveText} />}
      <AnimatePresence initial={false}>{liveText && <StatusLine key="status" text={liveText} />}</AnimatePresence>
      {message.status === "failed" && (
        <p className="flex items-start gap-2 text-[13px] leading-5 text-ink-2">
          <CircleAlert size={15} className="mt-0.5 shrink-0 text-danger" aria-hidden />
          <span>{message.error ?? "The agent couldn't finish this reply."}</span>
        </p>
      )}
      {message.status === "stopped" && (
        <p className="flex items-center gap-2 text-[13px] leading-5 text-ink-3">
          <CircleStop size={15} className="shrink-0" aria-hidden />
          Stopped
        </p>
      )}
    </div>
  );
}

/** What the agent is doing right now, with a soft pulse. Replaced by the next status. */
function StatusLine({ text }: { text: string }) {
  return (
    <motion.div
      role="status"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.15 } }}
      transition={quick}
      className="overflow-hidden"
    >
      <div className="flex h-6 items-center gap-2.5 text-[13.5px] text-ink-2">
        <WorkingGlyph />
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={text}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={quick}
            className="min-w-0 truncate"
          >
            <span className="animate-breathe">{text}…</span>
          </motion.span>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ---------- Activity log ----------

const KIND: Record<Activity["kind"], { icon: LucideIcon; one: string; many: string }> = {
  search: { icon: Search, one: "search", many: "searches" },
  lookup: { icon: Globe, one: "lookup", many: "lookups" },
  listing: { icon: Eye, one: "listing opened", many: "listings opened" },
  photos: { icon: Images, one: "photo check", many: "photo checks" },
  finding: { icon: CirclePlus, one: "finding added", many: "findings added" },
  withdraw: { icon: Undo2, one: "withdrawn", many: "withdrawn" },
};

const ORDER: Activity["kind"][] = ["search", "lookup", "listing", "photos", "finding", "withdraw"];
/** While running, the latest steps show and older ones fold behind a count. */
const RECENT = 5;

function summarize(activity: Activity[]) {
  const counts = new Map<Activity["kind"], number>();
  for (const a of activity) counts.set(a.kind, (counts.get(a.kind) ?? 0) + 1);
  return ORDER.filter((k) => counts.has(k))
    .map((k) => {
      const n = counts.get(k)!;
      return `${n} ${n === 1 ? KIND[k].one : KIND[k].many}`;
    })
    .join(" · ");
}

function ActivityLog({ activity, running }: { activity: Activity[]; running: boolean }) {
  // Open while the agent works; folds to a summary when the reply is done.
  const [open, setOpen] = useState<boolean | null>(null);
  const expanded = open ?? running;
  const [showAll, setShowAll] = useState(false);
  const older = running && !showAll ? Math.max(0, activity.length - RECENT) : 0;
  const visible = older ? activity.slice(older) : activity;

  return (
    <div className="-mx-1">
      <button
        type="button"
        onClick={() => setOpen(!expanded)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left text-[13px] text-ink-3 transition-colors hover:text-ink-2"
      >
        <span className="shrink-0 whitespace-nowrap font-medium text-ink-2">{plural(activity.length, "step")}</span>
        <span className="min-w-0 truncate">{summarize(activity)}</span>
        <ChevronDown
          size={14}
          className={cn("ml-auto shrink-0 transition-transform duration-200", expanded && "rotate-180")}
          aria-hidden
        />
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="log"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={easeOut}
            className="overflow-hidden"
          >
            {older > 0 && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="ml-[26px] mt-1 rounded-md px-1 text-xs text-ink-3 transition-colors hover:text-ink-2"
              >
                {plural(older, "earlier step")}
              </button>
            )}
            <ol className="flex flex-col gap-2 px-1 pb-1 pt-1.5">
              {visible.map((a, i) => (
                <ActivityRow key={older + i} activity={a} />
              ))}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ActivityRow({ activity }: { activity: Activity }) {
  const { icon: Icon } = KIND[activity.kind] ?? KIND.search;
  return (
    <motion.li
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={quick}
      className="flex gap-2.5"
    >
      <Icon
        size={14}
        className={cn("mt-[3px] shrink-0", activity.kind === "finding" ? "text-accent" : "text-ink-3")}
        aria-hidden
      />
      <div className="min-w-0">
        <p className="break-words text-[13px] leading-5 text-ink-2">{activity.text}</p>
        {activity.detail && <p className="text-xs leading-[18px] text-ink-3">{activity.detail}</p>}
      </div>
    </motion.li>
  );
}
