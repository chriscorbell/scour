// Listings as the agent reads them: compact text, one listing per two lines, times in Chris's time zone.
import type { Finding, Listing, Money } from "@scour/core";
import { env } from "../env.ts";
import type { ListingDetails, SearchParams, SearchResult } from "../ebay/types.ts";

export const usd = (m: Money | null | undefined) =>
  m == null ? "?" : m.currency === "USD" ? `$${m.value.toFixed(2)}` : `${m.value.toFixed(2)} ${m.currency}`;

export function clock(iso: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: env.timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

function span(ms: number) {
  const m = Math.round(Math.abs(ms) / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export const endsText = (iso: string) => {
  const ms = new Date(iso).getTime() - Date.now();
  return ms <= 0 ? `ended ${clock(iso)}` : `ends in ${span(ms)} (${clock(iso)})`;
};

const ageText = (iso: string) => `listed ${span(Date.now() - new Date(iso).getTime())} ago`;

export function priceText(l: Listing) {
  const auction = l.buyingOptions.includes("auction");
  const price = auction ? `${usd(l.price)} bid (${l.bidCount ?? 0} bids)` : usd(l.price);
  const ship = l.shipping == null ? "ship ?" : l.shipping.value === 0 ? "free ship" : `${usd(l.shipping)} ship`;
  return l.total ? `${price} + ${ship} = ${usd(l.total)}` : `${price} + ${ship}`;
}

const FORMAT_LABEL = { buy_it_now: "Buy It Now", auction: "Auction", best_offer: "Best Offer" } as const;

export function sellerText(l: Listing) {
  if (!l.seller) return "seller ?";
  const pct = l.seller.feedbackPercent != null ? ` ${l.seller.feedbackPercent}%` : "";
  const score = l.seller.feedbackScore != null ? ` (${l.seller.feedbackScore.toLocaleString("en-US")} ratings)` : "";
  return `seller${pct}${score}${l.topRated ? ", top rated" : ""}`;
}

export function listingLines(l: Listing, n: number | null, mark = ""): string {
  const facts = [
    priceText(l),
    l.condition ?? "condition ?",
    l.buyingOptions.map((o) => FORMAT_LABEL[o]).join(", "),
    l.endsAt ? endsText(l.endsAt) : null,
    sellerText(l),
    l.location,
    l.listedAt ? ageText(l.listedAt) : null,
  ].filter(Boolean);
  return `${n != null ? `${n}. ` : ""}${l.itemId}${mark} | ${l.title}\n   ${facts.join(" · ")}`;
}

export function filtersText(p: SearchParams): string {
  const parts = [
    p.categoryId ? `category ${p.categoryId}` : null,
    p.minPrice != null || p.maxPrice != null ? `price ${p.minPrice != null ? `$${p.minPrice}` : ""}–${p.maxPrice != null ? `$${p.maxPrice}` : ""}` : null,
    p.conditions?.length ? p.conditions.join("/") : null,
    p.formats?.length ? p.formats.join("/") : null,
    p.freeShippingOnly ? "free shipping" : null,
    p.returnsAccepted ? "returns accepted" : null,
    p.usOnly ? "in the US" : null,
    p.sort && p.sort !== "best_match" ? `sorted ${p.sort.replace("_", " ")}` : null,
  ];
  return parts.filter(Boolean).join(", ");
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** How the agent sees a page of search results. `marks` labels listings it has seen before, by item id. */
export function searchText(p: SearchParams, r: SearchResult, marks: Map<string, string>): string {
  if (!r.listings.length) return `No listings match "${p.query}"${filtersText(p) ? ` with ${filtersText(p)}` : ""}. Try other words or fewer filters.`;
  const totals = r.listings.map((l) => (l.total ?? l.price)?.value).filter((v): v is number => v != null);
  const lines = [
    `About ${r.total.toLocaleString("en-US")} matches; this is ${r.offset + 1}–${r.offset + r.listings.length}. Prices in USD. "ship ?" means calculated at checkout or not stated.`,
    r.categories.length ? `Categories: ${r.categories.slice(0, 6).map((c) => `${c.name} [${c.id}] ${c.count}`).join(" · ")}` : "",
    totals.length > 2 ? `Price + shipping on this page: low $${Math.min(...totals).toFixed(2)}, median $${median(totals).toFixed(2)}, high $${Math.max(...totals).toFixed(2)}.` : "",
    ...r.warnings.map((w) => `eBay warning: ${w}`),
    "",
    ...r.listings.map((l, i) => listingLines(l, r.offset + i + 1, marks.get(l.itemId) ?? "")),
  ];
  return lines.filter((l, i) => l !== "" || i > 0).join("\n");
}

export function detailsText(d: ListingDetails): string {
  const l = d.listing;
  return [
    listingLines(l, null),
    `Condition: ${l.condition ?? "?"}${d.conditionNote ? ` — seller says: "${d.conditionNote}"` : ""}`,
    `Shipping options: ${d.shippingOptions.length ? d.shippingOptions.join("; ") : "not stated"}`,
    `Returns: ${d.returns}`,
    d.quantityAvailable != null ? `Quantity available: ${d.quantityAvailable}` : "",
    `Photos: ${d.images.length}${d.images.length ? " (view_photos shows them)" : ""}`,
    d.variations.length ? `Variations (each has its own item id):\n${d.variations.map((v) => `- ${v.itemId}: ${v.label}, ${v.price}`).join("\n")}` : "",
    d.specifics.length ? `Item specifics:\n${d.specifics.map(([k, v]) => `- ${k}: ${v}`).join("\n")}` : "",
    `Description:\n${d.description || "(none)"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

const VERDICT_LABEL = { top_pick: "top pick", strong: "strong", worth_a_look: "worth a look" } as const;

export function findingLine(f: Finding): string {
  const state = f.withdrawnReason ? `withdrawn (${f.withdrawnReason})` : f.dismissed ? "dismissed by Chris" : f.starred ? "starred by Chris" : "on the page";
  return `- ${f.listing.itemId} | ${VERDICT_LABEL[f.verdict]} | ${priceText(f.listing)} | ${f.listing.title} | ${state}`;
}
