import type { Finding, Money } from "@scour/core";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "../../lib/cn.ts";
import { fmtMoney, fmtMoneyShort, headlinePrice } from "../../lib/format.ts";
import { softSpring } from "../../lib/motion.ts";
import { VERDICT_LABEL } from "./FindingCard.tsx";

interface PriceStripProps {
  findings: Finding[];
  highlight: number | null;
  onHighlight: (id: number | null) => void;
  onPick: (id: number) => void;
}

/**
 * Every finding's total on one axis, so the spread of prices reads at a glance: where the top picks sit
 * against the rest, and what the going rate is. Points at the card on hover; scrolls to it on click.
 */
export function PriceStrip({ findings, highlight, onHighlight, onPick }: PriceStripProps) {
  const points = findings
    .map((f) => ({ f, price: headlinePrice(f.listing) }))
    .filter((p): p is { f: Finding; price: Money } => p.price != null)
    .sort((a, b) => a.price.value - b.price.value);
  if (points.length < 2) return null;

  const currency = points[0]!.price.currency;
  const min = points[0]!.price.value;
  const max = points[points.length - 1]!.price.value;
  const span = max - min || 1;
  const values = points.map((p) => p.price.value);
  const mid = Math.floor(values.length / 2);
  const median = values.length % 2 ? values[mid]! : (values[mid - 1]! + values[mid]!) / 2;
  const at = (v: number) => ((v - min) / span) * 100;
  const active = points.find((p) => p.f.id === highlight);

  return (
    <figure className="mb-5 mt-1" aria-label="Totals across findings">
      <div className="relative mx-2 h-8">
        {/* Track and median */}
        <div className="absolute inset-x-0 top-[16px] h-px bg-line-strong" aria-hidden />
        <motion.div
          className="absolute top-[10px] h-[13px] w-px bg-ink-3"
          animate={{ left: `${at(median)}%` }}
          transition={softSpring}
          aria-hidden
        />
        {points.map(({ f, price }) => {
          const on = f.id === highlight;
          return (
            <motion.button
              key={f.id}
              type="button"
              initial={false}
              animate={{ left: `${at(price.value)}%` }}
              transition={softSpring}
              onPointerEnter={() => onHighlight(f.id)}
              onPointerLeave={() => onHighlight(null)}
              onFocus={() => onHighlight(f.id)}
              onBlur={() => onHighlight(null)}
              onClick={() => onPick(f.id)}
              aria-label={`${fmtMoney(price)}, ${VERDICT_LABEL[f.verdict]}: ${f.listing.title}`}
              className="absolute top-[16px] flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full focus-visible:outline-offset-0"
            >
              <span
                className={cn(
                  "rounded-full transition-[width,height,box-shadow] duration-150",
                  f.verdict === "top_pick" ? "bg-accent" : f.verdict === "strong" ? "bg-ink" : "bg-ink-3",
                  on ? "size-3.5 shadow-[0_0_0_3px_var(--color-bg)]" : "size-2.5 shadow-[0_0_0_2px_var(--color-bg)]",
                )}
              />
            </motion.button>
          );
        })}
      </div>
      <figcaption className="mt-1 grid grid-cols-[auto_1fr_auto] items-baseline gap-3 text-xs text-ink-3 tnum">
        <span>
          <span className="text-ink-2">{fmtMoneyShort({ value: min, currency })}</span> lowest
        </span>
        <span className="relative h-4 min-w-0 overflow-hidden text-center">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={active ? active.f.id : "median"}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }}
              className="block truncate"
            >
              {active ? (
                <>
                  <span className="font-medium text-ink">{fmtMoney(active.price)}</span> · {VERDICT_LABEL[active.f.verdict]} ·{" "}
                  {active.f.listing.title}
                </>
              ) : (
                <>
                  Median <span className="text-ink-2">{fmtMoneyShort({ value: median, currency })}</span> across {points.length}
                </>
              )}
            </motion.span>
          </AnimatePresence>
        </span>
        <span>
          highest <span className="text-ink-2">{fmtMoneyShort({ value: max, currency })}</span>
        </span>
      </figcaption>
    </figure>
  );
}
