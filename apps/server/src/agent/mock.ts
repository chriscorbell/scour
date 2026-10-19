// Mock mode (SCOUR_AGENT=mock): a scripted hunt with the same events as the real agent, at a watchable
// pace, for UI work and tests. It searches whichever eBay is configured, so mock listings by default.
import type { Verdict } from "@scour/core";
import { ebay } from "../ebay/index.ts";
import type { SearchParams } from "../ebay/types.ts";
import { findingsOf, getSettings, huntSummary, messagesOf, renameHunt, upsertFinding, withdrawFinding } from "../store.ts";
import { usd } from "./format.ts";
import type { Reply } from "./replies.ts";

const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), reject(new Error("aborted"))), { once: true });
  });

export async function mockConverse(reply: Reply, firstTurn: boolean) {
  const signal = reply.abort.signal;
  const ctx = { postalCode: getSettings().postalCode, signal };
  const request = messagesOf(reply.huntId).filter((m) => m.role === "user").at(-1)?.text ?? "";
  const query = request.replace(/[^\w\s-]/g, " ").split(/\s+/).filter(Boolean).slice(0, 4).join(" ") || "thinkcentre m920q";

  await pause(900, signal);
  if (firstTurn) {
    renameHunt(reply.huntId, query.replace(/\b\w/g, (c) => c.toUpperCase()));
    reply.emit({ type: "hunt", hunt: huntSummary(reply.huntId) });
  }

  // A follow-up withdraws one earlier finding, the way a refinement would.
  const earlier = findingsOf(reply.huntId).filter((f) => !f.withdrawnReason && !f.dismissed);
  if (!firstTurn && earlier.length) {
    const f = withdrawFinding(reply.huntId, earlier.at(-1)!.listing.itemId, "Doesn't fit what you just asked for")!;
    reply.finding(f, huntSummary(reply.huntId));
    reply.log("withdraw", `Withdrew "${f.listing.title.slice(0, 50)}"`, f.withdrawnReason);
  }

  const seen = new Map<string, Awaited<ReturnType<typeof ebay.search>>["listings"][number]>();
  const searches: [string, Partial<SearchParams>][] = [
    [query, {}],
    [`${query} lot`, { formats: ["auction"] }],
    [query, { sort: "price_low", conditions: ["used"] }],
  ];
  for (const [q, filters] of searches) {
    reply.status(`Searching "${q}"`);
    await pause(700, signal);
    const result = await ebay.search({ query: q, limit: 20, ...filters }, ctx);
    for (const l of result.listings) seen.set(l.itemId, l);
    reply.log("search", `Searched "${q}"`, `${result.total} results`);
  }

  const verdicts: Verdict[] = ["top_pick", "strong", "strong", "worth_a_look", "worth_a_look", "strong"];
  const picks = [...seen.values()].filter((l) => !earlier.some((f) => f.listing.itemId === l.itemId)).slice(0, verdicts.length);
  for (const [i, listing] of picks.entries()) {
    reply.status("Reading a listing");
    await pause(500, signal);
    reply.log("listing", `Opened "${listing.title.slice(0, 50)}"`, usd(listing.total ?? listing.price));
    if (i === 0) {
      reply.status("Looking at photos");
      await pause(600, signal);
      reply.log("photos", `Checked 4 photos of "${listing.title.slice(0, 50)}"`);
    }
    const finding = upsertFinding(reply.huntId, listing, {
      verdict: verdicts[i]!,
      headline: ["Best value with everything included", "Lowest total from a top seller", "Clean unit, free returns", "Auction that could go cheap", "Cheapest, but no box", "Newest listing in range"][i]!,
      why: "Mock mode: a stand-in reason. It matches the request, the seller has strong feedback, and the total is near the low end of current listings.",
      concerns: i % 2 ? ["Stock photo for the first image", "Ships in 3 business days"] : [],
    });
    reply.finding(finding, huntSummary(reply.huntId));
    reply.log("finding", `Added "${listing.title.slice(0, 50)}"`, finding.headline);
    await pause(400, signal);
  }

  reply.status("Writing");
  const words = `**Mock mode:** this reply is a stand-in, not from Claude.\n\nThe top pick is the first finding: it has everything included at a total near the low end of what's listed now.\n\n- Most listings run between **$90 and $160** with shipping.\n- Watch for listings without the power adapter.`.split(/(?<= )/);
  for (const w of words) {
    reply.delta(w);
    await pause(18, signal);
  }
}
