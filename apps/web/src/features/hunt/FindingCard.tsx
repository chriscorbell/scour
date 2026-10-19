import type { Finding, Verdict } from "@scour/core";
import { ArrowUpRight, BadgeCheck, EyeOff, ImageOff, MapPin, Star, Store, Timer, Undo2 } from "lucide-react";
import { motion } from "motion/react";
import { forwardRef, useLayoutEffect, useRef, useState } from "react";
import { useNow } from "../../lib/clock.ts";
import { cn } from "../../lib/cn.ts";
import { buyingLabel, countdown, fmtMoney, headlinePrice, plural, priceBreakdown } from "../../lib/format.ts";
import { softSpring } from "../../lib/motion.ts";

export const VERDICT_LABEL: Record<Verdict, string> = { top_pick: "Top pick", strong: "Strong", worth_a_look: "Worth a look" };

export function VerdictBadge({ verdict, className }: { verdict: Verdict; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-medium",
        verdict === "top_pick" && "bg-accent-soft text-accent",
        verdict === "strong" && "bg-raised text-ink",
        verdict === "worth_a_look" && "border border-line-strong text-ink-2",
        className,
      )}
    >
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

interface FindingCardProps {
  finding: Finding;
  /** Arrived while the page was open: rises in and carries a brief jade outline. */
  fresh: boolean;
  /** Pointed at from the price strip. */
  highlighted: boolean;
  onHighlight: (id: number | null) => void;
  onStar: (f: Finding) => void;
  onDismiss: (f: Finding) => void;
  onRestore: (f: Finding) => void;
}

export const FindingCard = forwardRef<HTMLLIElement, FindingCardProps>(function FindingCard(
  { finding, fresh, highlighted, onHighlight, onStar, onDismiss, onRestore },
  ref,
) {
  const l = finding.listing;
  const withdrawn = finding.withdrawnReason != null;
  const hidden = withdrawn || finding.dismissed;
  const price = headlinePrice(l);
  const formats = buyingLabel(l);
  const auction = l.buyingOptions.includes("auction");

  return (
    <motion.li
      ref={ref}
      layout
      id={`finding-${finding.id}`}
      initial={fresh ? { opacity: 0, y: 16, scale: 0.97 } : false}
      animate={{ opacity: hidden ? 0.62 : 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
      transition={softSpring}
      onPointerEnter={() => onHighlight(finding.id)}
      onPointerLeave={() => onHighlight(null)}
      className={cn(
        "group/card relative isolate flex flex-col overflow-hidden rounded-2xl bg-surface transition-colors duration-200",
        "max-sm:grid max-sm:grid-cols-[112px_1fr] max-sm:gap-x-3.5 max-sm:p-3",
        highlighted && "bg-[#1a1b1e]",
      )}
    >
      {fresh && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 rounded-2xl ring-1 ring-inset ring-accent/70"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 2.2, delay: 0.6, ease: "easeOut" }}
        />
      )}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 z-10 rounded-2xl ring-1 ring-inset ring-ink/25 transition-opacity duration-200",
          highlighted ? "opacity-100" : "opacity-0",
        )}
      />

      <a
        href={l.url}
        target="_blank"
        rel="noopener noreferrer"
        tabIndex={-1}
        aria-hidden
        className="relative block aspect-[4/3] overflow-hidden bg-raised max-sm:aspect-square max-sm:self-start max-sm:rounded-xl"
      >
        <Photo src={l.imageUrl} muted={hidden} />
      </a>

      <div className="flex min-w-0 flex-col p-4 pt-3.5 max-sm:p-0">
        {hidden && (
          <p className="mb-2 text-xs leading-4 text-ink-3">
            {withdrawn ? (
              <>
                <span className="font-medium text-ink-2">Withdrawn</span>
                {finding.withdrawnReason ? ` · ${finding.withdrawnReason}` : ""}
              </>
            ) : (
              <span className="font-medium text-ink-2">Dismissed</span>
            )}
          </p>
        )}

        <div className="flex items-center justify-between gap-2">
          <p className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-ink tnum max-sm:text-[19px] max-sm:leading-6">
            {price ? fmtMoney(price) : "—"}
          </p>
          <VerdictBadge verdict={finding.verdict} className="max-sm:hidden" />
        </div>
        <p className="mt-0.5 text-xs leading-4 text-ink-3 tnum">{priceBreakdown(l)}</p>

        <h3 className="mt-3 line-clamp-2 text-sm leading-5 text-ink max-sm:mt-2">
          <a
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-sm decoration-ink-3 underline-offset-2 hover:underline"
          >
            {l.title}
          </a>
        </h3>

        <p className="mt-1.5 text-xs leading-[18px] text-ink-3">
          {l.condition && <span className="inline-block max-w-full truncate align-bottom text-ink-2">{l.condition}</span>}
          {formats.map((f, i) => (
            <span key={f} className="whitespace-nowrap">
              {(i > 0 || l.condition) && <span aria-hidden> · </span>}
              {f}
            </span>
          ))}
        </p>
        {auction && l.endsAt && (
          <p className="mt-0.5 flex items-center gap-1.5 text-xs leading-[18px]">
            <Timer size={13} className="shrink-0 text-ink-3" aria-hidden />
            <Countdown endsAt={l.endsAt} />
          </p>
        )}

        {l.topRated && (
          <p className="mt-0.5 flex items-center gap-1.5 text-xs leading-[18px] text-ink-2">
            <BadgeCheck size={13} className="shrink-0" aria-hidden />
            Top rated seller
          </p>
        )}
        {l.seller && (l.seller.feedbackPercent != null || l.seller.feedbackScore != null) && (
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs leading-[18px] text-ink-3 tnum">
            <Store size={13} className="shrink-0" aria-hidden />
            <span className="sr-only">Seller feedback:</span>
            <span className="min-w-0 truncate">
              {l.seller.feedbackPercent != null && <span className="text-ink-2">{l.seller.feedbackPercent}% positive</span>}
              {l.seller.feedbackPercent != null && l.seller.feedbackScore != null && " · "}
              {l.seller.feedbackScore != null && plural(l.seller.feedbackScore, "rating")}
            </span>
          </p>
        )}
        {l.location && (
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs leading-[18px] text-ink-3">
            <MapPin size={13} className="shrink-0" aria-hidden />
            <span className="sr-only">Item location</span>
            <span className="truncate">{l.location}</span>
          </p>
        )}
      </div>

      <div className="flex flex-1 flex-col px-4 pb-3 max-sm:col-span-2 max-sm:px-0 max-sm:pb-0">
        <div className="border-t border-line pt-3.5 max-sm:mt-3.5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[13.5px] font-medium leading-5 text-ink">{finding.headline}</p>
            <VerdictBadge verdict={finding.verdict} className="sm:hidden" />
          </div>
          <Why text={finding.why} />
          {finding.concerns.length > 0 && (
            <ul className="mt-2.5 flex flex-col gap-1" aria-label="Concerns">
              {finding.concerns.map((c, i) => (
                <li key={i} className="flex gap-2 text-[13px] leading-5 text-caution">
                  <span className="mt-[8px] size-1 shrink-0 rounded-full bg-caution" aria-hidden />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-3 max-sm:pt-2.5">
          <a
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            className="-ml-2.5 inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[13px] font-medium text-ink-2 transition-colors hover:bg-raised hover:text-ink"
          >
            Open on eBay
            <ArrowUpRight size={14} aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
          <div className="-mr-1.5 flex items-center">
            <button
              type="button"
              onClick={() => onStar(finding)}
              aria-pressed={finding.starred}
              aria-label={finding.starred ? "Unstar" : "Star"}
              title={finding.starred ? "Unstar" : "Star"}
              disabled={withdrawn}
              className={cn(
                "inline-flex size-8 items-center justify-center rounded-full transition-[background-color,color,transform] duration-150 hover:bg-raised active:scale-90 disabled:opacity-40",
                finding.starred ? "text-ink" : "text-ink-3 hover:text-ink",
              )}
            >
              <motion.span
                key={finding.starred ? "on" : "off"}
                initial={finding.starred ? { scale: 0.6 } : false}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 600, damping: 18 }}
                className="flex"
              >
                <Star size={16} fill={finding.starred ? "currentColor" : "none"} aria-hidden />
              </motion.span>
            </button>
            {finding.dismissed ? (
              <button
                type="button"
                onClick={() => onRestore(finding)}
                aria-label="Restore"
                title="Restore to the board"
                className="inline-flex size-8 items-center justify-center rounded-full text-ink-2 transition-[background-color,color,transform] duration-150 hover:bg-raised hover:text-ink active:scale-90"
              >
                <Undo2 size={16} aria-hidden />
              </button>
            ) : (
              !withdrawn && (
                <button
                  type="button"
                  onClick={() => onDismiss(finding)}
                  aria-label="Dismiss"
                  title="Dismiss"
                  className="inline-flex size-8 items-center justify-center rounded-full text-ink-3 transition-[background-color,color,transform] duration-150 hover:bg-raised hover:text-ink active:scale-90"
                >
                  <EyeOff size={16} aria-hidden />
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </motion.li>
  );
});

function Photo({ src, muted }: { src: string | null; muted: boolean }) {
  const [state, setState] = useState<"loading" | "ok" | "failed">(src ? "loading" : "failed");
  if (!src || state === "failed") {
    return (
      <span className="flex size-full flex-col items-center justify-center gap-1.5 text-ink-3">
        <ImageOff size={20} aria-hidden />
        <span className="text-xs max-sm:sr-only">No photo</span>
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onLoad={() => setState("ok")}
      onError={() => setState("failed")}
      className={cn(
        "size-full object-cover transition-[opacity,transform,filter] duration-500 ease-out group-hover/card:scale-[1.03]",
        state === "ok" ? "opacity-100" : "opacity-0",
        muted && "grayscale",
      )}
    />
  );
}

/** The agent's reasoning, clamped to four lines with a way to read the rest. */
function Why({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    const check = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, open]);

  return (
    <div className="mt-1">
      <p ref={ref} className={cn("text-[13px] leading-5 text-ink-2", !open && "line-clamp-4")}>
        {text}
      </p>
      {(overflows || open) && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="mt-0.5 rounded-sm text-[13px] font-medium text-ink-2 hover:text-ink"
        >
          {open ? "Less" : "More"}
        </button>
      )}
    </div>
  );
}

function Countdown({ endsAt }: { endsAt: string }) {
  const now = useNow(1000);
  const left = countdown(endsAt, now);
  if (!left) return <span className="text-ink-3">Auction ended</span>;
  const soon = Date.parse(endsAt) - now < 3_600_000;
  return (
    <time dateTime={endsAt} className={cn("tnum", soon ? "text-caution" : "text-ink-2")} title={new Date(endsAt).toLocaleString()}>
      Ends in {left}
    </time>
  );
}
