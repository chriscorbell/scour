import { motion } from "motion/react";
import { cn } from "../lib/cn.ts";

/** A small jade dot with a slow ripple: the agent is working on this hunt. */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-flex size-2 shrink-0", className)} aria-hidden>
      <span className="absolute inset-0 animate-live rounded-full bg-accent" />
      <span className="relative size-2 rounded-full bg-accent" />
    </span>
  );
}

/** Three softly pulsing bars, for the status line. */
export function WorkingGlyph({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex h-3 items-end gap-[2px]", className)} aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-[3px] rounded-full bg-accent"
          animate={{ height: ["35%", "100%", "35%"] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut", delay: i * 0.15 }}
        />
      ))}
    </span>
  );
}
