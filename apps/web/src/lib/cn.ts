import { twMerge } from "tailwind-merge";

/** Join class names, skipping falsy values. Conflicting Tailwind utilities resolve to the last one. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return twMerge(parts.filter(Boolean).join(" "));
}
