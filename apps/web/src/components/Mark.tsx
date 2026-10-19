import { cn } from "../lib/cn.ts";

/** Scour's mark: a lens with a sweep through it, the agent going over every listing. */
export function Mark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={cn("shrink-0 text-accent", className)} aria-hidden>
      <circle cx="12" cy="12" r="8.25" fill="none" stroke="currentColor" strokeWidth="2.25" />
      <path d="M12 12 L12 3.75 A8.25 8.25 0 0 1 19.97 9.86 Z" fill="currentColor" />
      <circle cx="12" cy="12" r="1.9" fill="currentColor" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-[16px] font-semibold tracking-tight text-ink", className)}>
      <Mark />
      Scour
    </span>
  );
}
