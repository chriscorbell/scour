import type { Listing } from "@scour/core";

export const CONDITIONS = ["new", "open_box", "refurbished", "used", "for_parts"] as const;
export type Condition = (typeof CONDITIONS)[number];

export const FORMATS = ["buy_it_now", "auction", "best_offer"] as const;
export type Format = (typeof FORMATS)[number];

export const SORTS = ["best_match", "price_low", "price_high", "newly_listed", "ending_soon"] as const;
export type Sort = (typeof SORTS)[number];

export interface SearchParams {
  query: string;
  categoryId?: string | undefined;
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  conditions?: Condition[] | undefined;
  formats?: Format[] | undefined;
  sort?: Sort | undefined;
  freeShippingOnly?: boolean | undefined;
  returnsAccepted?: boolean | undefined;
  /** Only items located in the US. Every search already requires delivery to the US. */
  usOnly?: boolean | undefined;
  limit?: number | undefined;
  /** 1-based page of `limit` results. */
  page?: number | undefined;
}

export interface SearchResult {
  total: number;
  offset: number;
  listings: Listing[];
  /** The categories the matches fall in, most first. */
  categories: { id: string; name: string; count: number }[];
  warnings: string[];
}

/** Everything about one listing that the agent reads before recommending it. */
export interface ListingDetails {
  listing: Listing;
  conditionNote: string | null;
  /** Item specifics, as eBay lists them: brand, model, capacity, what's included. */
  specifics: [string, string][];
  /** The seller's description as plain text, trimmed. */
  description: string;
  returns: string;
  shippingOptions: string[];
  quantityAvailable: number | null;
  images: string[];
  /** For a listing with variations: what's offered, by item id. */
  variations: { itemId: string; label: string; price: string }[];
}

export interface CallContext {
  /** Ship-to ZIP code, for shipping estimates. */
  postalCode: string | null;
  signal?: AbortSignal | undefined;
}

export interface Ebay {
  search(params: SearchParams, ctx: CallContext): Promise<SearchResult>;
  item(itemId: string, ctx: CallContext): Promise<ListingDetails>;
}

export class EbayError extends Error {}
