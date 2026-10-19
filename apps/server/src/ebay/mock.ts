// Made-up listings for UI work and tests (SCOUR_EBAY=mock). Deterministic: the same query gives the same
// listings, so a hunt looks the same after a reload. Photos come from picsum.photos.
import type { BuyingOption, Listing } from "@scour/core";
import type { Condition, Ebay, ListingDetails, SearchParams, SearchResult } from "./types.ts";

function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const CONDITION_LABEL: Record<Condition, string> = {
  new: "New",
  open_box: "Open box",
  refurbished: "Seller refurbished",
  used: "Used",
  for_parts: "For parts or not working",
};
const EXTRAS = ["with power adapter", "tested & working", "fast shipping", "lot of 2", "no box", "original box", "great condition", "light scratches", "free returns", "bundle"];
const PLACES = ["Austin, TX", "Columbus, OH", "Portland, OR", "Tampa, FL", "Denver, CO", "Raleigh, NC", "Shenzhen, CN", "Toronto, CA"];

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

function listingsFor(query: string): Listing[] {
  const rand = rng(query.toLowerCase().trim());
  const base = 40 + Math.round(rand() * 260);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
  return Array.from({ length: 48 }, (_, i): Listing => {
    const condition = pick(["used", "used", "used", "refurbished", "new", "open_box", "for_parts"] as const);
    const auction = rand() < 0.25;
    const bestOffer = !auction && rand() < 0.35;
    const factor = condition === "for_parts" ? 0.35 : condition === "new" ? 1.35 : condition === "open_box" ? 1.15 : 1;
    const price = Math.round(base * factor * (0.7 + rand() * 0.8) * (auction ? 0.6 : 1)) - 0.01;
    const ship = rand() < 0.45 ? 0 : Math.round(6 + rand() * 18) - 0.01;
    const legacy = String(100000000000 + Math.floor(rand() * 899999999999));
    const itemId = `v1|${legacy}|0`;
    const options: BuyingOption[] = auction ? ["auction"] : bestOffer ? ["buy_it_now", "best_offer"] : ["buy_it_now"];
    const listedDaysAgo = Math.floor(rand() * 20);
    const shipping = rand() < 0.1 ? null : { value: ship, currency: "USD" };
    return {
      itemId,
      title: `${titleCase(query)} ${pick(EXTRAS)}${rand() < 0.4 ? ` ${pick(EXTRAS)}` : ""}`.slice(0, 80),
      url: `https://www.ebay.com/itm/${legacy}`,
      imageUrl: `https://picsum.photos/seed/${legacy}/500/500`,
      price: { value: price, currency: "USD" },
      shipping,
      total: shipping ? { value: Math.round((price + shipping.value) * 100) / 100, currency: "USD" } : null,
      condition: CONDITION_LABEL[condition],
      buyingOptions: options,
      bidCount: auction ? Math.floor(rand() * 14) : null,
      endsAt: auction || rand() < 0.2 ? new Date(Date.now() + (1 + rand() * 120) * 3600_000).toISOString() : null,
      listedAt: new Date(Date.now() - listedDaysAgo * 86400_000 - i * 60_000).toISOString(),
      seller: { feedbackPercent: Math.round((96 + rand() * 4) * 10) / 10, feedbackScore: Math.floor(rand() * rand() * 40000) },
      location: pick(PLACES),
      topRated: rand() < 0.3,
    };
  });
}

const conditionOf = (l: Listing) => (Object.entries(CONDITION_LABEL).find(([, label]) => label === l.condition)?.[0] ?? "used") as Condition;

export function mockEbay(): Ebay {
  const seen = new Map<string, Listing>();
  return {
    async search(p: SearchParams): Promise<SearchResult> {
      await new Promise((r) => setTimeout(r, 300 + Math.random() * 500));
      let all = listingsFor(p.query);
      if (p.minPrice != null) all = all.filter((l) => (l.price?.value ?? 0) >= p.minPrice!);
      if (p.maxPrice != null) all = all.filter((l) => (l.price?.value ?? 0) <= p.maxPrice!);
      if (p.conditions?.length) all = all.filter((l) => p.conditions!.includes(conditionOf(l)));
      if (p.formats?.length) all = all.filter((l) => l.buyingOptions.some((o) => p.formats!.includes(o)));
      if (p.freeShippingOnly) all = all.filter((l) => l.shipping?.value === 0);
      if (p.usOnly) all = all.filter((l) => !/, (CN|CA)$/.test(l.location ?? ""));
      const cost = (l: Listing) => l.total?.value ?? l.price?.value ?? 0;
      if (p.sort === "price_low") all.sort((a, b) => cost(a) - cost(b));
      if (p.sort === "price_high") all.sort((a, b) => cost(b) - cost(a));
      if (p.sort === "newly_listed") all.sort((a, b) => (b.listedAt ?? "").localeCompare(a.listedAt ?? ""));
      if (p.sort === "ending_soon") all = all.filter((l) => l.endsAt).sort((a, b) => a.endsAt!.localeCompare(b.endsAt!));
      const limit = p.limit ?? 50;
      const offset = ((p.page ?? 1) - 1) * limit;
      const listings = all.slice(offset, offset + limit);
      for (const l of listings) seen.set(l.itemId, l);
      return { total: all.length, offset, listings, categories: [{ id: "171957", name: "Desktops & All-In-Ones", count: all.length }], warnings: [] };
    },

    async item(itemId: string): Promise<ListingDetails> {
      await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));
      const listing = seen.get(itemId);
      if (!listing) throw new Error("That listing isn't available (mock eBay only knows listings from earlier searches).");
      const legacy = itemId.split("|")[1];
      return {
        listing,
        conditionNote: listing.condition === "Used" ? "Light wear on the case. Fully tested." : null,
        specifics: [
          ["Brand", "Lenovo"],
          ["Model", listing.title.split(" ").slice(0, 3).join(" ")],
          ["Includes", listing.title.includes("adapter") ? "Power adapter" : "Unit only"],
        ],
        description: `${listing.title}. Pulled from a working office. Tested and wiped. Ships within one business day.`,
        returns: listing.title.includes("free returns") ? "30 days, seller pays return shipping" : "30 days, buyer pays return shipping",
        shippingOptions: [listing.shipping?.value === 0 ? "USPS Ground Advantage: free" : "USPS Ground Advantage: calculated at checkout"],
        quantityAvailable: 1,
        images: [1, 2, 3].map((n) => `https://picsum.photos/seed/${legacy}-${n}/800/800`),
        variations: [],
      };
    },
  };
}
