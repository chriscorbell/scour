import { env } from "../env.ts";
import { liveEbay } from "./live.ts";
import { mockEbay } from "./mock.ts";
import type { Ebay } from "./types.ts";

export const ebay: Ebay = env.ebay === "mock" ? mockEbay() : liveEbay();
