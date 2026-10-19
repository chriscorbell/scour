// One shared clock for relative times and auction countdowns, ticking only while something listens.
import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let now = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const l of listeners) l();
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** The current time, updated every second, rounded down to `step` ms so slow readers re-render less. */
export function useNow(step = 1000): number {
  const t = useSyncExternalStore(subscribe, () => now);
  return Math.floor(t / step) * step;
}
