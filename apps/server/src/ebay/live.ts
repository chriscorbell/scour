// eBay's Buy Browse API with an application token (client credentials): live listings, no user sign-in.
// https://developer.ebay.com/api-docs/buy/browse/overview.html
import type { BuyingOption, Listing, Money } from "@scour/core";
import { env } from "../env.ts";
import { EbayError, type CallContext, type Condition, type Ebay, type Format, type ListingDetails, type SearchParams, type SearchResult, type Sort } from "./types.ts";

const API = "https://api.ebay.com";
const SCOPE = "https://api.ebay.com/oauth/api_scope";

interface Amount {
  value: string;
  currency: string;
}

interface ShippingOption {
  shippingCostType?: string;
  shippingCost?: Amount;
  shippingServiceCode?: string;
  type?: string;
  minEstimatedDeliveryDate?: string;
  maxEstimatedDeliveryDate?: string;
}

interface Item {
  itemId: string;
  title: string;
  itemWebUrl?: string;
  image?: { imageUrl?: string };
  additionalImages?: { imageUrl?: string }[];
  price?: Amount;
  currentBidPrice?: Amount;
  bidCount?: number;
  buyingOptions?: string[];
  condition?: string;
  conditionDescription?: string;
  itemEndDate?: string;
  itemCreationDate?: string;
  seller?: { username?: string; feedbackPercentage?: string; feedbackScore?: number };
  shippingOptions?: ShippingOption[];
  itemLocation?: { city?: string; stateOrProvince?: string; postalCode?: string; country?: string };
  topRatedBuyingExperience?: boolean;
  itemGroupHref?: string;
  description?: string;
  shortDescription?: string;
  localizedAspects?: { name: string; value: string }[];
  returnTerms?: {
    returnsAccepted?: boolean;
    returnPeriod?: { value?: number; unit?: string };
    returnShippingCostPayer?: string;
  };
  estimatedAvailabilities?: { estimatedAvailableQuantity?: number }[];
}

interface SearchResponse {
  total?: number;
  offset?: number;
  itemSummaries?: Item[];
  refinement?: { categoryDistributions?: { categoryId: string; categoryName: string; matchCount: number }[] };
  warnings?: { message?: string }[];
}

const CONDITION_IDS: Record<Condition, number[]> = {
  new: [1000],
  open_box: [1500, 1750],
  refurbished: [2000, 2010, 2020, 2030, 2500],
  used: [2750, 2990, 3000, 3010, 4000, 5000, 6000],
  for_parts: [7000],
};

const BUYING_OPTIONS: Record<Format, string> = { buy_it_now: "FIXED_PRICE", auction: "AUCTION", best_offer: "BEST_OFFER" };

const SORT: Record<Sort, string | null> = {
  best_match: null,
  price_low: "price",
  price_high: "-price",
  newly_listed: "newlyListed",
  ending_soon: "endingSoonest",
};

const money = (a: Amount | undefined): Money | null => (a ? { value: Number(a.value), currency: a.currency } : null);

/** A mid-size version of an eBay image URL: big enough for a card, small enough to load fast. */
export const sizedImage = (url: string | undefined, size = 500) => (url ? url.replace(/\/s-l\d+\./, `/s-l${size}.`) : null);

function cheapestShipping(options: ShippingOption[] | undefined): Money | null {
  const costs = (options ?? []).map((o) => money(o.shippingCost)).filter((m): m is Money => m != null);
  return costs.length ? costs.reduce((a, b) => (b.value < a.value ? b : a)) : null;
}

function toListing(item: Item): Listing {
  const options = item.buyingOptions ?? [];
  const auction = options.includes("AUCTION");
  const price = money(auction && item.currentBidPrice ? item.currentBidPrice : item.price);
  const shipping = cheapestShipping(item.shippingOptions);
  const loc = item.itemLocation;
  // Search results carry a city (with the EXTENDED field group) and a masked ZIP; a full item has the state too.
  const place = [loc?.city, loc?.stateOrProvince].filter(Boolean).join(", ") || loc?.postalCode || "";
  const location = place ? (loc?.country && loc.country !== "US" ? `${place}, ${loc.country}` : place) : (loc?.country ?? null);
  return {
    itemId: item.itemId,
    title: item.title,
    url: item.itemWebUrl ?? `https://www.ebay.com/itm/${item.itemId.split("|")[1] ?? ""}`,
    imageUrl: sizedImage(item.image?.imageUrl),
    price,
    shipping,
    total: price && shipping && price.currency === shipping.currency ? { value: Math.round((price.value + shipping.value) * 100) / 100, currency: price.currency } : null,
    condition: item.condition ?? null,
    buyingOptions: options.flatMap((o): BuyingOption[] => (o === "FIXED_PRICE" ? ["buy_it_now"] : o === "AUCTION" ? ["auction"] : o === "BEST_OFFER" ? ["best_offer"] : [])),
    bidCount: auction ? (item.bidCount ?? 0) : null,
    endsAt: item.itemEndDate ?? null,
    listedAt: item.itemCreationDate ?? null,
    // No username: see Listing.seller.
    seller: item.seller
      ? {
          feedbackPercent: item.seller.feedbackPercentage != null ? Number(item.seller.feedbackPercentage) : null,
          feedbackScore: item.seller.feedbackScore ?? null,
        }
      : null,
    location,
    topRated: item.topRatedBuyingExperience === true,
  };
}

/** The seller's HTML description as readable text. */
export function htmlToText(html: string, max = 3000): string {
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
  return text.length > max ? `${text.slice(0, max)}… (cut off)` : text;
}

function returnsText(terms: Item["returnTerms"]): string {
  if (!terms) return "Not stated";
  if (!terms.returnsAccepted) return "No returns";
  const period = terms.returnPeriod?.value ? `${terms.returnPeriod.value} days` : "Accepted";
  const payer = terms.returnShippingCostPayer === "SELLER" ? "seller pays return shipping" : terms.returnShippingCostPayer === "BUYER" ? "buyer pays return shipping" : "";
  return [period, payer].filter(Boolean).join(", ");
}

function shippingText(o: ShippingOption): string {
  const cost = o.shippingCostType === "CALCULATED" && !o.shippingCost ? "calculated at checkout" : o.shippingCost ? (Number(o.shippingCost.value) === 0 ? "free" : `$${o.shippingCost.value}`) : "cost not stated";
  const name = o.type ?? o.shippingServiceCode ?? "Shipping";
  const eta = o.minEstimatedDeliveryDate || o.maxEstimatedDeliveryDate ? `, arrives ${[o.minEstimatedDeliveryDate, o.maxEstimatedDeliveryDate].filter(Boolean).map((d) => d!.slice(0, 10)).join(" to ")}` : "";
  return `${name}: ${cost}${eta}`;
}

function details(item: Item, variations: ListingDetails["variations"] = []): ListingDetails {
  const images = [item.image?.imageUrl, ...(item.additionalImages ?? []).map((i) => i.imageUrl)].filter((u): u is string => !!u);
  return {
    listing: toListing(item),
    conditionNote: item.conditionDescription ?? null,
    specifics: (item.localizedAspects ?? []).map((a) => [a.name, a.value]),
    description: item.description ? htmlToText(item.description) : (item.shortDescription ?? ""),
    returns: returnsText(item.returnTerms),
    shippingOptions: (item.shippingOptions ?? []).map(shippingText),
    quantityAvailable: item.estimatedAvailabilities?.[0]?.estimatedAvailableQuantity ?? null,
    images,
    variations,
  };
}

export function searchFilters(p: SearchParams): string[] {
  const filters = ["deliveryCountry:US"];
  if (p.minPrice != null || p.maxPrice != null) {
    const range = p.minPrice != null && p.maxPrice != null ? `${p.minPrice}..${p.maxPrice}` : p.minPrice != null ? `${p.minPrice}` : `..${p.maxPrice}`;
    filters.push(`price:[${range}]`, "priceCurrency:USD");
  }
  if (p.conditions?.length) filters.push(`conditionIds:{${p.conditions.flatMap((c) => CONDITION_IDS[c]).join("|")}}`);
  // Without a buyingOptions filter eBay returns only fixed-price listings, so ask for auctions too.
  const formats = p.formats?.length ? p.formats : (["buy_it_now", "auction"] as const);
  filters.push(`buyingOptions:{${formats.map((f) => BUYING_OPTIONS[f]).join("|")}}`);
  if (p.freeShippingOnly) filters.push("maxDeliveryCost:0");
  if (p.returnsAccepted) filters.push("returnsAccepted:true");
  if (p.usOnly) filters.push("itemLocationCountry:US");
  return filters;
}

export function liveEbay(): Ebay {
  let token: { value: string; expiresAt: number } | null = null;
  /** Variation listings come back from search with a group link instead of a fetchable item. */
  const groups = new Map<string, string>();

  async function appToken(force = false): Promise<string> {
    if (!force && token && token.expiresAt - 5 * 60_000 > Date.now()) return token.value;
    const res = await fetch(`${API}/identity/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${env.ebayClientId}:${env.ebayClientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "client_credentials", scope: SCOPE }),
    });
    if (!res.ok) throw new EbayError(`eBay rejected the app's keys (${res.status}): ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return token.value;
  }

  async function get<T>(url: string, ctx: CallContext, retried = false): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await appToken(retried)}`,
      "X-EBAY-C-MARKETPLACE-ID": env.ebayMarketplace,
      Accept: "application/json",
    };
    if (ctx.postalCode) headers["X-EBAY-C-ENDUSERCTX"] = `contextualLocation=${encodeURIComponent(`country=US,zip=${ctx.postalCode}`)}`;
    const res = await fetch(url, { headers, signal: ctx.signal ?? null });
    if (res.status === 401 && !retried) return get<T>(url, ctx, true);
    if (res.ok) return (await res.json()) as T;
    const body = await res.text();
    let message = body.slice(0, 300);
    try {
      const parsed = JSON.parse(body) as { errors?: { errorId?: number; message?: string; longMessage?: string }[] };
      const first = parsed.errors?.[0];
      if (first) message = `${first.longMessage ?? first.message ?? ""} (error ${first.errorId})`;
    } catch {}
    if (res.status === 429) throw new EbayError("eBay's daily call limit for this app is used up. It resets at midnight Pacific time.");
    throw new EbayError(`eBay answered ${res.status}: ${message}`);
  }

  return {
    async search(p, ctx): Promise<SearchResult> {
      // eBay cuts q at 100 characters, and the offset has to be a multiple of the limit.
      const limit = Math.min(Math.max(p.limit ?? 50, 1), 200);
      const params = new URLSearchParams({
        q: p.query.slice(0, 100),
        limit: String(limit),
        offset: String((Math.max(p.page ?? 1, 1) - 1) * limit),
        filter: searchFilters(p).join(","),
        fieldgroups: "MATCHING_ITEMS,CATEGORY_REFINEMENTS,EXTENDED",
      });
      const sort = SORT[p.sort ?? "best_match"];
      if (sort) params.set("sort", sort);
      if (p.categoryId) params.set("category_ids", p.categoryId);
      const body = await get<SearchResponse>(`${API}/buy/browse/v1/item_summary/search?${params}`, ctx);
      const items = body.itemSummaries ?? [];
      for (const item of items) if (item.itemGroupHref) groups.set(item.itemId, item.itemGroupHref);
      return {
        total: body.total ?? items.length,
        offset: body.offset ?? 0,
        listings: items.map(toListing),
        categories: (body.refinement?.categoryDistributions ?? [])
          .map((c) => ({ id: c.categoryId, name: c.categoryName, count: c.matchCount }))
          .sort((a, b) => b.count - a.count),
        warnings: (body.warnings ?? []).map((w) => w.message ?? "").filter(Boolean),
      };
    },

    async item(itemId, ctx): Promise<ListingDetails> {
      const group = groups.get(itemId);
      if (group) {
        const body = await get<{ items?: Item[] }>(group, ctx);
        const items = body.items ?? [];
        const chosen = items.find((i) => i.itemId === itemId) ?? items[0];
        if (!chosen) throw new EbayError("That listing has no variations available any more.");
        const variations = items.map((i) => ({
          itemId: i.itemId,
          label: (i.localizedAspects ?? []).map((a) => `${a.name}: ${a.value}`).join(", ") || i.title,
          price: i.price ? `$${i.price.value}` : "?",
        }));
        return details(chosen, variations);
      }
      const item = await get<Item>(`${API}/buy/browse/v1/item/${encodeURIComponent(itemId)}`, ctx);
      return details(item);
    },
  };
}
