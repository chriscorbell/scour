// A mock hunt through the HTTP API: the reply streams findings, saves them, and a follow-up refines.
import { beforeAll, expect, it } from "vitest";
import type { AgentModel, HuntStreamEvent, HuntView, Settings } from "@scour/core";
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

it("saves the model and effort", async () => {
  const before = (await (await app.request("/api/settings")).json()) as Settings;
  expect(before).toMatchObject({ model: "claude-opus-5-5", effort: "high" });
  const models = (await (await app.request("/api/models")).json()) as AgentModel[];
  const pick = models.find((m) => m.id !== before.model)!;
  const res = await app.request("/api/settings", { method: "PUT", body: JSON.stringify({ ...before, model: pick.id, effort: "low" }), headers: { "content-type": "application/json" } });
  expect(await res.json()).toEqual({ ...before, model: pick.id, effort: "low" });
  const bad = await app.request("/api/settings", { method: "PUT", body: JSON.stringify({ ...before, effort: "extreme" }), headers: { "content-type": "application/json" } });
  expect(bad.status).toBe(400);
});
