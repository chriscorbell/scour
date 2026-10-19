// A mock hunt through the HTTP API: the reply streams findings, saves them, and a follow-up refines.
import { beforeAll, expect, it } from "vitest";
import type { HuntStreamEvent, HuntView } from "@scour/core";
import { createApp } from "../src/app.ts";
import { migrate } from "../src/db.ts";

const app = createApp();

beforeAll(() => migrate());

async function events(res: Response): Promise<HuntStreamEvent[]> {
  const text = await res.text();
  return text
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice(6)) as HuntStreamEvent);
}

const post = (path: string, body: unknown) => app.request(path, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

it("runs a hunt and a follow-up", { timeout: 60_000 }, async () => {
  const first = await events(await post("/api/hunts", { text: "thinkcentre m920q" }));
  expect(first[0]?.type).toBe("start");
  expect(first.at(-1)?.type).toBe("done");
  const found = first.filter((e) => e.type === "finding");
  expect(found.length).toBeGreaterThan(2);
  const huntId = first[0]!.type === "start" ? first[0]!.hunt.id : 0;

  const second = await events(await post(`/api/hunts/${huntId}/messages`, { text: "only free shipping" }));
  expect(second.some((e) => e.type === "finding" && e.finding.withdrawnReason)).toBe(true);

  const view = (await (await app.request(`/api/hunts/${huntId}`)).json()) as HuntView;
  expect(view.messages.map((m) => m.status)).toEqual(["done", "done", "done", "done"]);
  expect(view.running).toBe(false);
  expect(view.findings.length).toBeGreaterThan(found.length);
});
