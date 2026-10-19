import type { BuyingOption, Listing, Money } from "@scour/core";

const moneyFormats = new Map<string, Intl.NumberFormat>();
function moneyFormat(currency: string) {
  let f = moneyFormats.get(currency);
  if (!f) {
    try {
      f = new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch {
      f = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    moneyFormats.set(currency, f);
  }
  return f;
}

/** "$142.50" */
export const fmtMoney = (m: Money) => moneyFormat(m.currency).format(m.value);
/** "$142" for axis labels where cents are noise. */
export const fmtMoneyShort = (m: Money) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: m.currency, maximumFractionDigits: 0 }).format(m.value);

const int = new Intl.NumberFormat("en-US");
export const fmtInt = (n: number) => int.format(n);

/** The number shown big on a card: the total when known, else the price. */
export function headlinePrice(l: Listing): Money | null {
  return l.total ?? l.price;
}

/** The line under the big number: "$129.00 + $13.50 ship", "$40.99 bid + $19.99 ship", "Free shipping". */
export function priceBreakdown(l: Listing): string {
  const bid = l.buyingOptions.includes("auction") && l.price ? `${fmtMoney(l.price)} bid` : null;
  if (!l.shipping) return bid ? `${bid} + shipping calculated` : l.price ? "Shipping calculated" : "No price listed";
  if (l.shipping.value === 0) return bid ? `${bid} · Free shipping` : "Free shipping";
  return l.price ? `${bid ?? fmtMoney(l.price)} + ${fmtMoney(l.shipping)} ship` : `+${fmtMoney(l.shipping)} ship`;
}

const OPTION_LABEL: Record<BuyingOption, string> = { buy_it_now: "Buy It Now", auction: "Auction", best_offer: "Best Offer" };

export function buyingLabel(l: Listing): string[] {
  return l.buyingOptions.map((o) => {
    if (o === "auction" && l.bidCount != null) return `Auction · ${l.bidCount === 1 ? "1 bid" : `${fmtInt(l.bidCount)} bids`}`;
    return OPTION_LABEL[o];
  });
}

/** "2d 4h", "3h 12m", "12m 05s", "42s". Null once it has ended. */
export function countdown(endsAt: string, now: number): string | null {
  const ms = Date.parse(endsAt) - now;
  if (!(ms > 0)) return null;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}

/** "Just now", "4m", "3h", "Yesterday", "Oct 12". */
export function relativeTime(iso: string, now: number): string {
  const t = Date.parse(iso);
  const diff = Math.max(0, now - t);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h ago`;
  const date = new Date(t);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

export const plural = (n: number, one: string, many = `${one}s`) => `${fmtInt(n)} ${n === 1 ? one : many}`;
