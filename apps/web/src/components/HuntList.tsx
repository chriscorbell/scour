import type { HuntSummary } from "@scour/core";
import { motion } from "motion/react";
import { NavLink } from "react-router";
import { useNow } from "../lib/clock.ts";
import { cn } from "../lib/cn.ts";
import { plural, relativeTime } from "../lib/format.ts";
import { spring } from "../lib/motion.ts";
import { useHunts } from "../lib/queries.ts";
import { LiveDot } from "./Live.tsx";

const DAY = 86_400_000;

function groupHunts(hunts: HuntSummary[], now: number) {
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const groups: { label: string; hunts: HuntSummary[] }[] = [
    { label: "Today", hunts: [] },
    { label: "This week", hunts: [] },
    { label: "Earlier", hunts: [] },
  ];
  for (const h of hunts) {
    const t = Date.parse(h.updatedAt);
    const g = h.running || t >= startOfToday ? 0 : t >= startOfToday - 6 * DAY ? 1 : 2;
    groups[g]!.hunts.push(h);
  }
  return groups.filter((g) => g.hunts.length > 0);
}

/** The hunts, most recently updated first, grouped by when. `layoutId` scopes the active pill per list. */
export function HuntList({ layoutId }: { layoutId: string }) {
  const hunts = useHunts();
  const now = useNow(30_000);

  if (hunts.isPending) {
    return (
      <div className="flex flex-col gap-1 px-2 pt-6" aria-busy="true" aria-label="Loading hunts">
        {[68, 52, 74, 46].map((w, i) => (
          <div key={i} className="flex h-[52px] flex-col justify-center gap-2 px-3">
            <div className="h-3 rounded-full bg-raised" style={{ width: `${w}%` }} />
            <div className="h-2.5 w-20 rounded-full bg-raised/70" />
          </div>
        ))}
      </div>
    );
  }

  if (hunts.isError) {
    return (
      <div className="px-5 pt-6 text-[13px] leading-relaxed text-ink-3">
        Couldn't load your hunts.{" "}
        <button type="button" onClick={() => void hunts.refetch()} className="font-medium text-ink underline-offset-2 hover:underline">
          Retry
        </button>
      </div>
    );
  }

  if (hunts.data.length === 0) {
    return <p className="px-5 pt-6 text-[13px] leading-relaxed text-ink-3">Your hunts will be listed here.</p>;
  }

  return (
    <nav aria-label="Hunts" className="flex flex-col gap-5 px-2 pb-4 pt-5">
      {groupHunts(hunts.data, now).map((group) => (
        <div key={group.label}>
          <h2 className="px-3 pb-1.5 text-xs font-medium text-ink-3">{group.label}</h2>
          <ul className="flex flex-col gap-px">
            {group.hunts.map((h) => (
              <li key={h.id}>
                <HuntRow hunt={h} now={now} layoutId={layoutId} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function HuntRow({ hunt, now, layoutId }: { hunt: HuntSummary; now: number; layoutId: string }) {
  return (
    <NavLink
      to={`/hunts/${hunt.id}`}
      className="group relative isolate flex min-h-[52px] flex-col justify-center gap-0.5 rounded-xl px-3 py-2 transition-colors hover:bg-surface"
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span layoutId={layoutId} transition={spring} className="absolute inset-0 -z-10 rounded-xl bg-raised" aria-hidden />
          )}
          <span className={cn("truncate text-sm leading-5 transition-colors", isActive ? "text-ink" : "text-ink-2 group-hover:text-ink")}>
            {hunt.title}
          </span>
          <span className="flex items-center gap-1.5 text-xs leading-4 text-ink-3 tnum">
            {hunt.running ? (
              <>
                <LiveDot className="mr-0.5" />
                <span className="text-ink-2">Hunting</span>
                <span aria-hidden>·</span>
                <span>{hunt.findingCount} found</span>
              </>
            ) : (
              <>
                <span>{plural(hunt.findingCount, "finding")}</span>
                <span aria-hidden>·</span>
                <span>{relativeTime(hunt.updatedAt, now)}</span>
              </>
            )}
          </span>
        </>
      )}
    </NavLink>
  );
}
