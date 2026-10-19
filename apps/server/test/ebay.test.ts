import { describe, expect, it } from "vitest";
import { htmlToText, searchFilters, sizedImage } from "../src/ebay/live.ts";

describe("searchFilters", () => {
  it("always requires US delivery and asks for auctions alongside Buy It Now", () => {
    expect(searchFilters({ query: "x" })).toEqual(["deliveryCountry:US", "buyingOptions:{FIXED_PRICE|AUCTION}"]);
  });

  it("writes open-ended price ranges with the currency eBay requires", () => {
    expect(searchFilters({ query: "x", minPrice: 10 })).toContain("price:[10]");
    expect(searchFilters({ query: "x", maxPrice: 150 })).toContain("price:[..150]");
    expect(searchFilters({ query: "x", minPrice: 10, maxPrice: 150 })).toEqual(expect.arrayContaining(["price:[10..150]", "priceCurrency:USD"]));
  });

  it("maps conditions and formats to eBay's ids", () => {
    const f = searchFilters({ query: "x", conditions: ["new", "for_parts"], formats: ["best_offer"], freeShippingOnly: true, usOnly: true });
    expect(f).toEqual(expect.arrayContaining(["conditionIds:{1000|7000}", "buyingOptions:{BEST_OFFER}", "maxDeliveryCost:0", "itemLocationCountry:US"]));
  });
});

describe("htmlToText", () => {
  it("drops markup, scripts and styles, and keeps line breaks", () => {
    expect(htmlToText("<style>p{}</style><p>Tested &amp; working</p><script>x()</script><ul><li>Adapter</li><li>Box</li></ul>")).toBe("Tested & working\nAdapter\nBox");
  });

  it("cuts long descriptions", () => {
    expect(htmlToText("a".repeat(50), 10)).toBe("aaaaaaaaaa… (cut off)");
  });
});

it("asks eBay's image server for a mid-size photo", () => {
  expect(sizedImage("https://i.ebayimg.com/images/g/abc/s-l1600.jpg")).toBe("https://i.ebayimg.com/images/g/abc/s-l500.jpg");
});
