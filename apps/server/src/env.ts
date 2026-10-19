import path from "node:path";
import { Effort } from "@scour/core";

const here = import.meta.dirname;

export const env = {
  port: Number(process.env.PORT ?? 3120),
  host: process.env.HOST ?? "0.0.0.0",
  dataDir: process.env.SCOUR_DATA_DIR ?? path.resolve(here, "../data"),
  /** claude: the agent runs on Claude through the Agent SDK. mock: canned replies, for UI work and tests. */
  agent: (process.env.SCOUR_AGENT ?? "claude") as "claude" | "mock",
  /** live: eBay's production Browse API. mock: built-in sample listings. */
  ebay: (process.env.SCOUR_EBAY ?? "live") as "live" | "mock",
  ebayClientId: process.env.EBAY_CLIENT_ID ?? "",
  ebayClientSecret: process.env.EBAY_CLIENT_SECRET ?? "",
  ebayMarketplace: process.env.EBAY_MARKETPLACE ?? "EBAY_US",
  /** The model and effort until they're changed in Settings. */
  model: process.env.SCOUR_MODEL ?? "claude-opus-5-5",
  effort: Effort.parse(process.env.SCOUR_EFFORT ?? "high"),
  /** Time zone for the dates the agent reads, such as when an auction ends. */
  timeZone: process.env.TZ || "America/New_York",
  webDist: process.env.SCOUR_WEB_DIST ?? path.resolve(here, "../../web/dist"),
  version: process.env.SCOUR_VERSION ?? "dev",
};

if (env.ebay === "live" && (!env.ebayClientId || !env.ebayClientSecret)) {
  throw new Error("Set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET (the production App ID and Cert ID), or SCOUR_EBAY=mock.");
}
