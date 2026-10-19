import { useSyncExternalStore } from "react";

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** The width where the hunt list stays docked beside the page. */
export const useWideShell = () => useMediaQuery("(min-width: 1280px)");
/** The width where the conversation and the findings sit side by side. */
export const useSplitHunt = () => useMediaQuery("(min-width: 1024px)");
