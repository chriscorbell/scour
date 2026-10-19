// The shapes the server and the web app share. docs/api.md describes the endpoints that carry them.
import { z } from "zod";

export const Money = z.object({ value: z.number(), currency: z.string() });
export type Money = z.infer<typeof Money>;

export const BuyingOption = z.enum(["buy_it_now", "auction", "best_offer"]);
export type BuyingOption = z.infer<typeof BuyingOption>;

/** An eBay listing, flattened to what Scour shows and what the agent reads. */
export const Listing = z.object({
  itemId: z.string(),
  title: z.string(),
  url: z.string(),
  imageUrl: z.string().nullable(),
  /** The current bid for an auction, otherwise the Buy It Now price. */
  price: Money.nullable(),
  /** The cheapest shipping option. Null when eBay calculates it at checkout or doesn't say; 0 is free. */
  shipping: Money.nullable(),
  /** price + shipping, when both are known. */
  total: Money.nullable(),
  condition: z.string().nullable(),
  buyingOptions: z.array(BuyingOption),
  bidCount: z.number().nullable(),
  /** When the listing ends: always set for auctions, often null for Buy It Now. */
  endsAt: z.string().nullable(),
  listedAt: z.string().nullable(),
  /**
   * The seller's feedback. Not their username: Scour keeps no eBay user data, which is what lets the app
   * claim eBay's Marketplace Account Deletion exemption.
   */
  seller: z
    .object({
      feedbackPercent: z.number().nullable(),
      feedbackScore: z.number().nullable(),
    })
    .nullable(),
  /** "Austin, TX" or a country code. */
  location: z.string().nullable(),
  topRated: z.boolean(),
});
export type Listing = z.infer<typeof Listing>;

/** How strongly the agent recommends a finding. */
export const Verdict = z.enum(["top_pick", "strong", "worth_a_look"]);
export type Verdict = z.infer<typeof Verdict>;

/** A listing the agent vetted and put on the page, with its reasoning. */
export const Finding = z.object({
  id: z.number(),
  huntId: z.number(),
  listing: Listing,
  verdict: Verdict,
  /** A few words on what makes it stand out, e.g. "Cheapest with the power brick". */
  headline: z.string(),
  why: z.string(),
  concerns: z.array(z.string()),
  starred: z.boolean(),
  dismissed: z.boolean(),
  /** Set when the agent took the finding back, e.g. after a refinement ruled it out. */
  withdrawnReason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Finding = z.infer<typeof Finding>;

/** One step the agent took during a reply, shown as its activity log. */
export const Activity = z.object({
  kind: z.enum(["search", "listing", "photos", "lookup", "finding", "withdraw"]),
  /** e.g. `Searched "thinkcentre m920q"`. */
  text: z.string(),
  /** e.g. "Used · under $150 · 214 results". */
  detail: z.string().nullable(),
  at: z.string(),
});
export type Activity = z.infer<typeof Activity>;

export const MessageStatus = z.enum(["pending", "done", "failed", "stopped"]);
export type MessageStatus = z.infer<typeof MessageStatus>;

export const Message = z.object({
  id: z.number(),
  huntId: z.number(),
  role: z.enum(["user", "agent"]),
  /** Markdown for agent replies: short paragraphs, bullets, bold. */
  text: z.string(),
  status: MessageStatus,
  error: z.string().nullable(),
  activity: z.array(Activity),
  createdAt: z.string(),
});
export type Message = z.infer<typeof Message>;

export const HuntSummary = z.object({
  id: z.number(),
  title: z.string(),
  running: z.boolean(),
  /** Findings that aren't withdrawn or dismissed. */
  findingCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type HuntSummary = z.infer<typeof HuntSummary>;

export const HuntView = HuntSummary.extend({
  messages: z.array(Message),
  /** Every finding, including withdrawn and dismissed ones, oldest first. */
  findings: z.array(Finding),
});
export type HuntView = z.infer<typeof HuntView>;

export const MessageRequest = z.object({ text: z.string().trim().min(1).max(4000) });
export type MessageRequest = z.infer<typeof MessageRequest>;

export const FindingPatch = z.object({ starred: z.boolean().optional(), dismissed: z.boolean().optional() });
export type FindingPatch = z.infer<typeof FindingPatch>;

/** How hard the agent thinks before it acts. Higher is slower and more thorough. */
export const Effort = z.enum(["low", "medium", "high", "xhigh", "max"]);
export type Effort = z.infer<typeof Effort>;

/** A Claude model the agent can run on, as offered to Scour's Claude account (GET /api/models). */
export interface AgentModel {
  /** Model ID, e.g. "claude-opus-5-5". */
  id: string;
  /** e.g. "Opus 5.5". */
  name: string;
  description: string;
  /** Effort levels it accepts. Empty when it doesn't take one. */
  efforts: Effort[];
}

export const Settings = z.object({
  /** Where items ship to, for shipping estimates. US ZIP code, or null. */
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, "A 5-digit ZIP code")
    .nullable(),
  /** Anything the agent should always keep in mind, e.g. "I'd rather not buy from outside the US". */
  notes: z.string().trim().max(2000),
  /** The agent's model ID, from GET /api/models. Defaults to SCOUR_MODEL. */
  model: z.string().trim().min(1).max(100),
  /** Defaults to SCOUR_EFFORT. Ignored when the model doesn't take an effort level. */
  effort: Effort,
});
export type Settings = z.infer<typeof Settings>;

export interface Health {
  ok: true;
  version: string;
  /** claude: the agent runs on Claude. mock: canned replies for UI work. */
  agent: "claude" | "mock";
  /** live: eBay's production API. mock: built-in sample listings. */
  ebay: "live" | "mock";
}

/** Events on a reply's stream (POST /api/hunts, POST /api/hunts/:id/messages, GET /api/hunts/:id/stream). */
export type HuntStreamEvent =
  /** First event on a POST: the hunt, the saved message and the pending reply. Not sent on a resumed stream. */
  | { type: "start"; hunt: HuntSummary; message: Message; reply: Message }
  /** The hunt changed, e.g. the agent named it. */
  | { type: "hunt"; hunt: HuntSummary }
  /** What the agent is doing right now, e.g. "Searching". Replaced by the next status. */
  | { type: "status"; text: string }
  | { type: "activity"; activity: Activity }
  /** Text appended to the reply. */
  | { type: "delta"; text: string }
  /** A finding was added or changed (including withdrawn). */
  | { type: "finding"; finding: Finding }
  /** The reply finished, failed or was stopped. The last event. */
  | { type: "done"; reply: Message; hunt: HuntSummary };

export const VERDICT_ORDER: Record<Verdict, number> = { top_pick: 0, strong: 1, worth_a_look: 2 };
