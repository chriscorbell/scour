import { VERDICT_ORDER, type Finding, type HuntView, type Message } from "@scour/core";
import { headlinePrice } from "./format.ts";

export type SortKey = "best" | "total" | "ending" | "newest";

export const SORT_LABEL: Record<SortKey, string> = {
  best: "Best match",
  total: "Lowest total",
  ending: "Ending soonest",
  newest: "Newest",
};

/** On the board by default: not withdrawn by the agent, not dismissed by Chris. */
export const isActive = (f: Finding) => !f.dismissed && f.withdrawnReason == null;

const price = (f: Finding) => headlinePrice(f.listing)?.value ?? Number.POSITIVE_INFINITY;
const ends = (f: Finding) => (f.listing.endsAt ? Date.parse(f.listing.endsAt) : Number.POSITIVE_INFINITY);

const compare: Record<SortKey, (a: Finding, b: Finding) => number> = {
  best: (a, b) => VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict] || price(a) - price(b),
  total: (a, b) => price(a) - price(b) || VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict],
  // Ended auctions sink to the bottom with the listings that don't end.
  ending: (a, b) => endKey(a) - endKey(b) || VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict],
  newest: (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id - a.id,
};

function endKey(f: Finding) {
  const t = ends(f);
  return t < Date.now() ? Number.POSITIVE_INFINITY : t;
}

export const sortFindings = (list: Finding[], key: SortKey) => [...list].sort(compare[key]);

/**
 * Put a finding into a list by id. The agent owns the listing and its reasoning, Chris owns starred and
 * dismissed: a replayed event that is older than a local change keeps the local flags.
 */
export function mergeFinding(list: Finding[], f: Finding): Finding[] {
  const i = list.findIndex((x) => x.id === f.id);
  if (i === -1) return [...list, f];
  const cur = list[i]!;
  const next = list.slice();
  next[i] =
    Date.parse(cur.updatedAt) > Date.parse(f.updatedAt)
      ? { ...f, starred: cur.starred, dismissed: cur.dismissed, updatedAt: cur.updatedAt }
      : f;
  return next;
}

export const activeCount = (v: HuntView) => v.findings.filter(isActive).length;

export const isPendingReply = (m: Message) => m.role === "agent" && m.status === "pending";
