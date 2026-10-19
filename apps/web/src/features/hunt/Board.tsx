import type { Activity, Finding, HuntView } from "@scour/core";
import { ArrowDownUp, ChevronDown, Eye, EyeOff, Star } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { forwardRef, useState, type ReactNode } from "react";
import { WorkingGlyph } from "../../components/Live.tsx";
import { toast } from "../../components/ui/Toast.tsx";
import { cn } from "../../lib/cn.ts";
import { isActive, isPendingReply, SORT_LABEL, sortFindings, type SortKey } from "../../lib/findings.ts";
import { easeOut, quick } from "../../lib/motion.ts";
import { usePatchFinding } from "../../lib/queries.ts";
import { FindingCard } from "./FindingCard.tsx";
import { PriceStrip } from "./PriceStrip.tsx";

const SORT_STORAGE = "scour.sort";
const readSort = (): SortKey => {
  try {
    const v = localStorage.getItem(SORT_STORAGE);
    if (v && v in SORT_LABEL) return v as SortKey;
  } catch {
    // Storage off: the default sort.
  }
  return "best";
};

interface BoardProps {
  view: HuntView;
  status: string | null;
  /** Focus the follow-up composer, from the empty states. */
  onRefine: () => void;
}

export function Board({ view, status, onRefine }: BoardProps) {
  const patch = usePatchFinding(view.id);
  const [sort, setSortState] = useState<SortKey>(readSort);
  const [starredOnly, setStarredOnly] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [highlight, setHighlight] = useState<number | null>(null);
  // Findings on the page when it opened appear in place; later ones arrive with motion.
  const [initialIds] = useState(() => new Set(view.findings.map((f) => f.id)));

  const setSort = (s: SortKey) => {
    setSortState(s);
    try {
      localStorage.setItem(SORT_STORAGE, s);
    } catch {
      // Not remembered, still applied.
    }
  };

  const active = view.findings.filter(isActive);
  const hidden = view.findings.length - active.length;
  const starred = active.filter((f) => f.starred).length;
  let shown = showHidden ? view.findings : active;
  if (starredOnly) shown = shown.filter((f) => f.starred);
  shown = sortFindings(shown, sort);

  const pending = view.messages.findLast(isPendingReply);
  const lastReply = view.messages.findLast((m) => m.role === "agent");
  const lastActivity = pending?.activity.at(-1);

  const star = (f: Finding) => patch.mutate({ id: f.id, patch: { starred: !f.starred } });
  const dismiss = (f: Finding) => {
    setHighlight(null);
    patch.mutate(
      { id: f.id, patch: { dismissed: true } },
      {
        onSuccess: () =>
          toast("Finding dismissed", {
            action: { label: "Undo", onClick: () => patch.mutate({ id: f.id, patch: { dismissed: false } }) },
          }),
      },
    );
  };
  const restore = (f: Finding) => patch.mutate({ id: f.id, patch: { dismissed: false } });

  const pick = (id: number) => {
    const el = document.getElementById(`finding-${id}`);
    el?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
    el?.querySelector<HTMLAnchorElement>("h3 a")?.focus({ preventScroll: true });
  };

  const noFindingsYet = view.findings.length === 0;

  return (
    <div className="px-4 pb-12 sm:px-5 xl:px-6">
      <div className="z-20 -mx-4 flex flex-wrap sm:sticky sm:top-0 items-center justify-between gap-x-4 gap-y-2 bg-bg px-4 py-3 sm:-mx-5 sm:px-5 xl:-mx-6 xl:px-6">
        <h2 className="flex items-baseline text-[15px] font-semibold text-ink tnum">
          <AnimatedCount value={active.length} />
          <span className="ml-[0.3em]">{active.length === 1 ? "finding" : "findings"}</span>
          {starred > 0 && <span className="ml-2 text-[13px] font-normal text-ink-3">· {starred} starred</span>}
        </h2>
        {!noFindingsYet && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Toggle
              pressed={starredOnly}
              onClick={() => setStarredOnly((v) => !v)}
              disabled={starred === 0 && !starredOnly}
              icon={<Star size={14} fill={starredOnly ? "currentColor" : "none"} aria-hidden />}
              title="Starred only"
            >
              <span className="max-sm:sr-only">Starred</span>
            </Toggle>
            {(hidden > 0 || showHidden) && (
              <Toggle
                pressed={showHidden}
                onClick={() => setShowHidden((v) => !v)}
                icon={showHidden ? <Eye size={14} aria-hidden /> : <EyeOff size={14} aria-hidden />}
                title="Dismissed and withdrawn findings"
              >
                <span className="max-sm:sr-only">Hidden</span> <span className={cn("tnum", !showHidden && "text-ink-3")}>{hidden}</span>
              </Toggle>
            )}
            <SortSelect value={sort} onChange={setSort} />
          </div>
        )}
      </div>

      {noFindingsYet ? (
        view.running ? (
          <Working status={status} activity={lastActivity} />
        ) : (
          <EmptyState title="Nothing on the board" action={{ label: "Refine the hunt", onClick: onRefine }}>
            {lastReply?.status === "stopped"
              ? "You stopped the agent before it vetted a listing. Send a message to pick the hunt back up."
              : lastReply?.status === "failed"
                ? "The reply failed before any listing was vetted. Send a message to try again."
                : "The agent didn't put any listings here. Ask it to widen the search: a higher budget, other models, or a looser condition."}
          </EmptyState>
        )
      ) : (
        <>
          <PriceStrip findings={active} highlight={highlight} onHighlight={setHighlight} onPick={pick} />
          {shown.length === 0 ? (
            <EmptyState title="No starred findings" action={{ label: "Show all", onClick: () => setStarredOnly(false) }}>
              Star the listings you like and they'll collect here.
            </EmptyState>
          ) : (
            <LayoutGroup>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(228px,1fr))] gap-3.5 max-sm:grid-cols-1">
                <AnimatePresence initial={false} mode="popLayout">
                  {shown.map((f) => (
                    <FindingCard
                      key={f.id}
                      finding={f}
                      fresh={!initialIds.has(f.id)}
                      highlighted={highlight === f.id}
                      onHighlight={setHighlight}
                      onStar={star}
                      onDismiss={dismiss}
                      onRestore={restore}
                    />
                  ))}
                  {view.running && !starredOnly && <NextSlot key="next" status={status} />}
                </AnimatePresence>
              </ul>
            </LayoutGroup>
          )}
        </>
      )}
    </div>
  );
}

function AnimatedCount({ value }: { value: number }) {
  return (
    <span className="relative inline-flex overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={value} initial={{ y: "70%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "-70%", opacity: 0 }} transition={quick}>
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function Toggle({
  pressed,
  onClick,
  disabled,
  icon,
  title,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  disabled?: boolean;
  icon: ReactNode;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97] disabled:opacity-45 disabled:active:scale-100",
        pressed ? "bg-ink text-bg" : "border border-line-strong text-ink-2 hover:bg-raised hover:text-ink",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function SortSelect({ value, onChange }: { value: SortKey; onChange: (v: SortKey) => void }) {
  return (
    <label className="relative inline-flex h-8 items-center rounded-full border border-line-strong text-[13px] font-medium text-ink-2 transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent hover:bg-raised hover:text-ink">
      <ArrowDownUp size={14} className="pointer-events-none absolute left-3" aria-hidden />
      <span className="sr-only">Sort findings</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SortKey)}
        className="h-full appearance-none rounded-full bg-transparent pl-8 pr-8 focus:outline-none focus-visible:outline-none"
      >
        {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
          <option key={k} value={k} className="bg-surface text-ink">
            {SORT_LABEL[k]}
          </option>
        ))}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-3" aria-hidden />
    </label>
  );
}

/** The first reply is running and nothing is vetted yet: the board shows what the agent is doing. */
function Working({ status, activity }: { status: string | null; activity: Activity | undefined }) {
  return (
    <div className="pt-1">
      <div className="flex items-center gap-2.5" role="status">
        <WorkingGlyph />
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={status ?? "start"}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={quick}
            className="animate-breathe text-[15px] font-medium text-ink"
          >
            {status ?? "Starting the hunt"}…
          </motion.p>
        </AnimatePresence>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={activity ? `${activity.at}-${activity.text}` : "none"}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={quick}
          className="mt-1 min-h-5 pl-[23px] text-[13px] leading-5 text-ink-3"
        >
          {activity ? (
            <>
              <span className="text-ink-2">{activity.text}</span>
              {activity.detail && ` · ${activity.detail}`}
            </>
          ) : (
            "Listings show up here as soon as the agent has vetted them."
          )}
        </motion.p>
      </AnimatePresence>
      <ul className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(228px,1fr))] gap-3.5 max-sm:grid-cols-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <PlaceholderCard key={i} delay={i * 0.25} className={i === 2 ? "max-sm:hidden" : undefined} />
        ))}
      </ul>
    </div>
  );
}

function PlaceholderCard({ delay, className }: { delay: number; className?: string }) {
  return (
    <motion.li
      className={cn("overflow-hidden rounded-2xl bg-surface", className)}
      animate={{ opacity: [0.55, 0.9, 0.55] }}
      transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay }}
    >
      <div className="aspect-[4/3] bg-raised max-sm:aspect-[16/7]" />
      <div className="flex flex-col gap-2.5 p-4">
        <div className="h-6 w-24 rounded-full bg-raised" />
        <div className="h-3 w-4/5 rounded-full bg-raised" />
        <div className="h-3 w-3/5 rounded-full bg-raised" />
        <div className="mt-3 h-3 w-2/3 rounded-full bg-raised" />
        <div className="h-3 w-full rounded-full bg-raised" />
      </div>
    </motion.li>
  );
}

/** The grid's next cell while the agent keeps going: where the next finding will land. */
const NextSlot = forwardRef<HTMLLIElement, { status: string | null }>(function NextSlot({ status }, ref) {
  return (
    <motion.li
      ref={ref}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={easeOut}
      className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line-strong px-6 text-center max-sm:min-h-[120px]"
      aria-hidden
    >
      <WorkingGlyph />
      <span className="animate-breathe text-[13px] leading-5 text-ink-3">{status ? `${status}…` : "Still looking…"}</span>
    </motion.li>
  );
});

function EmptyState({ title, children, action }: { title: string; children: ReactNode; action: { label: string; onClick: () => void } }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={easeOut}
      className="mt-2 flex max-w-[520px] flex-col items-start rounded-2xl bg-surface p-6"
    >
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{children}</p>
      <button
        type="button"
        onClick={action.onClick}
        className="mt-4 inline-flex h-9 items-center rounded-full bg-raised px-4 text-sm font-medium text-ink transition-[background-color,transform] hover:bg-hover active:scale-[0.97]"
      >
        {action.label}
      </button>
    </motion.div>
  );
}

