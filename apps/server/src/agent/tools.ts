// The agent's tools: search eBay, read a listing, look at its photos, and manage the findings on Chris's
// page. Every tool reports what it did to the reply, which streams it to the page as activity.
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { Verdict, type Listing } from "@scour/core";
import { ebay } from "../ebay/index.ts";
import { sizedImage } from "../ebay/live.ts";
import { CONDITIONS, FORMATS, SORTS, type ListingDetails, type SearchParams } from "../ebay/types.ts";
import { findingsOf, getSettings, huntSummary, renameHunt, upsertFinding, withdrawFinding } from "../store.ts";
import { detailsText, filtersText, priceText, searchText } from "./format.ts";
import type { Reply } from "./replies.ts";

type CallToolResult = Awaited<ReturnType<Parameters<typeof tool>[3]>>;

const text = (t: string): CallToolResult => ({ content: [{ type: "text", text: t }] });
const failed = (err: unknown): CallToolResult => ({ content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }], isError: true });

/** Recently seen listings, so presenting one doesn't need another call to eBay. */
const listings = new Map<string, Listing>();
const details = new Map<string, ListingDetails>();
function remember(l: Listing) {
  listings.delete(l.itemId);
  listings.set(l.itemId, l);
  if (listings.size > 3000) listings.delete(listings.keys().next().value!);
}

const short = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

const readOnly = { annotations: { readOnlyHint: true } };

export function huntTools(reply: Reply) {
  const ctx = () => ({ postalCode: getSettings().postalCode, signal: reply.abort.signal });

  async function loadDetails(itemId: string): Promise<ListingDetails> {
    const d = await ebay.item(itemId, ctx());
    details.set(itemId, d);
    remember(d.listing);
    return d;
  }

  return [
    tool(
      "name_hunt",
      "Give this hunt a short name for Chris's list of hunts: 2 to 5 words, like \"ThinkCentre M920q\" or \"Herman Miller Aeron, size B\".",
      { title: z.string().min(2).max(60) },
      async ({ title }) => {
        renameHunt(reply.huntId, title);
        reply.emit({ type: "hunt", hunt: huntSummary(reply.huntId) });
        return text("Named.");
      },
    ),

    tool(
      "search_ebay",
      "Search live eBay listings (US marketplace, items that ship to the US). Returns up to `limit` listings with price, shipping, condition, format, seller and location, plus the categories matches fall in and the price spread. Buy It Now and auctions both come back unless `formats` narrows it.",
      {
        query: z.string().min(1).max(100).describe("Keywords, as you'd type them into eBay. Model and part numbers work well."),
        categoryId: z.string().optional().describe("Restrict to one category id, from an earlier search's Categories line."),
        minPrice: z.number().min(0).optional().describe("USD, item price"),
        maxPrice: z.number().min(0).optional().describe("USD, item price"),
        conditions: z.array(z.enum(CONDITIONS)).optional(),
        formats: z.array(z.enum(FORMATS)).optional(),
        sort: z.enum(SORTS).optional().describe("price_low and price_high include shipping. Default best_match."),
        freeShippingOnly: z.boolean().optional(),
        returnsAccepted: z.boolean().optional(),
        usOnly: z.boolean().optional().describe("Only items located in the US"),
        limit: z.number().int().min(1).max(100).optional().describe("Default 40"),
        page: z.number().int().min(1).max(20).optional(),
      },
      async (input) => {
        const params: SearchParams = { ...input, limit: input.limit ?? 40 };
        reply.status(`Searching "${short(params.query, 40)}"`);
        try {
          const result = await ebay.search(params, ctx());
          for (const l of result.listings) remember(l);
          const marks = new Map(findingsOf(reply.huntId).map((f) => [f.listing.itemId, f.withdrawnReason ? " [withdrawn]" : f.dismissed ? " [dismissed by Chris]" : " [already presented]"]));
          const filters = filtersText(params);
          reply.log("search", `Searched "${params.query}"`, [filters, `${result.total.toLocaleString("en-US")} results`].filter(Boolean).join(" · "));
          return text(searchText(params, result, marks));
        } catch (err) {
          reply.log("search", `Searched "${params.query}"`, "Failed");
          return failed(err);
        }
      },
      readOnly,
    ),

    tool(
      "get_listing",
      "Open one listing: condition notes, item specifics, the seller's description, shipping options, returns, quantity, photo count, and variations.",
      { itemId: z.string().describe("The item id from search results, like v1|123456789012|0") },
      async ({ itemId }) => {
        reply.status("Reading a listing");
        try {
          const d = await loadDetails(itemId);
          reply.log("listing", `Opened "${short(d.listing.title)}"`, priceText(d.listing));
          return text(detailsText(d));
        } catch (err) {
          return failed(err);
        }
      },
      readOnly,
    ),

    tool(
      "view_photos",
      "Look at a listing's photos, to check condition, what's included, or whether the photos are the real item or stock images.",
      { itemId: z.string(), count: z.number().int().min(1).max(6).optional().describe("How many photos, from the first. Default 4.") },
      async ({ itemId, count }) => {
        reply.status("Looking at photos");
        try {
          const d = details.get(itemId) ?? (await loadDetails(itemId));
          const urls = d.images.slice(0, count ?? 4);
          if (!urls.length) return text("This listing has no photos.");
          const images = await Promise.all(
            urls.map(async (url) => {
              const res = await fetch(sizedImage(url, 800) ?? url, { signal: reply.abort.signal });
              if (!res.ok) return null;
              const mimeType = res.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
              return { type: "image" as const, data: Buffer.from(await res.arrayBuffer()).toString("base64"), mimeType };
            }),
          );
          const loaded = images.filter((i) => i != null);
          reply.log("photos", `Checked ${loaded.length} photo${loaded.length === 1 ? "" : "s"} of "${short(d.listing.title)}"`);
          return { content: [{ type: "text", text: `${loaded.length} of ${d.images.length} photos:` }, ...loaded] };
        } catch (err) {
          return failed(err);
        }
      },
      readOnly,
    ),

    tool(
      "present_finding",
      "Put a listing on Chris's page as a finding, or update one you presented before. He sees it right away.",
      {
        itemId: z.string(),
        verdict: Verdict.describe("top_pick: one you'd buy. strong: a good option. worth_a_look: has a trade-off worth knowing about."),
        headline: z.string().max(70).describe('A few words on what sets it apart, e.g. "Cheapest with the power brick"'),
        why: z.string().max(400).describe("One or two sentences on why it's worth his attention."),
        concerns: z.array(z.string().max(160)).max(4).describe("Short, specific, real concerns only. Empty when there are none."),
      },
      async ({ itemId, verdict, headline, why, concerns }) => {
        reply.status("Adding a finding");
        try {
          const listing = details.get(itemId)?.listing ?? listings.get(itemId) ?? (await loadDetails(itemId)).listing;
          const finding = upsertFinding(reply.huntId, listing, { verdict, headline, why, concerns });
          reply.finding(finding, huntSummary(reply.huntId));
          reply.log("finding", `Added "${short(listing.title)}"`, headline);
          return text("It's on Chris's page now.");
        } catch (err) {
          return failed(err);
        }
      },
    ),

    tool(
      "withdraw_finding",
      "Take a finding off Chris's page because it no longer fits, e.g. after he narrowed what he wants or it sold.",
      { itemId: z.string(), reason: z.string().max(160).describe("A few words Chris will see, e.g. \"Ships from outside the US\"") },
      async ({ itemId, reason }) => {
        const finding = withdrawFinding(reply.huntId, itemId, reason);
        if (!finding) return failed(new Error("That listing isn't one of this hunt's findings."));
        reply.finding(finding, huntSummary(reply.huntId));
        reply.log("withdraw", `Withdrew "${short(finding.listing.title)}"`, reason);
        return text("Withdrawn.");
      },
    ),
  ];
}
