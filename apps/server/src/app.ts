import fs from "node:fs";
import path from "node:path";
import { Hono, type Context } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { ZodError, type ZodType } from "zod";
import { FindingPatch, MessageRequest, Settings, type Health } from "@scour/core";
import { listModels } from "./agent/models.ts";
import { activeReply, followReply, isRunning } from "./agent/replies.ts";
import { startReply, stopReply } from "./agent/run.ts";
import { env } from "./env.ts";
import { HttpError } from "./http.ts";
import { deleteHunt, getSettings, huntView, listHunts, patchFinding, putSettings } from "./store.ts";

const json = <T extends ZodType>(schema: T) =>
  zValidator("json", schema, (result, c) => {
    if (!result.success) return c.json({ error: "Invalid request.", details: result.error.issues }, 400);
  });

const id = (c: Context) => {
  const n = Number(c.req.param("id"));
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, "Bad id.");
  return n;
};

export function createApp() {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message, details: err.details }, err.status);
    if (err instanceof ZodError) return c.json({ error: "Invalid request.", details: err.issues }, 400);
    console.error(err);
    return c.json({ error: "Something went wrong on the server." }, 500);
  });

  app.get("/api/health", (c) => c.json({ ok: true, version: env.version, agent: env.agent, ebay: env.ebay } satisfies Health));

  app.get("/api/hunts", (c) => c.json(listHunts()));
  app.post("/api/hunts", json(MessageRequest), (c) => {
    const { reply, start } = startReply(c.req.valid("json").text);
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({ event: start.type, data: JSON.stringify(start) });
      await followReply(reply, stream);
    });
  });
  app.get("/api/hunts/:id", (c) => c.json(huntView(id(c))));
  app.delete("/api/hunts/:id", (c) => {
    const huntId = id(c);
    if (isRunning(huntId)) throw new HttpError(409, "Stop the agent before deleting this hunt.");
    deleteHunt(huntId);
    return c.json({ ok: true });
  });
  app.post("/api/hunts/:id/messages", json(MessageRequest), (c) => {
    const { reply, start } = startReply(c.req.valid("json").text, id(c));
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({ event: start.type, data: JSON.stringify(start) });
      await followReply(reply, stream);
    });
  });
  // Picks a reply back up, from its beginning, after the page lost the original stream.
  app.get("/api/hunts/:id/stream", (c) => {
    const reply = activeReply(id(c));
    if (!reply) throw new HttpError(409, "The agent isn't working on this hunt.");
    return streamSSE(c, (stream) => followReply(reply, stream));
  });
  app.post("/api/hunts/:id/stop", (c) => {
    stopReply(id(c));
    return c.json({ ok: true });
  });

  app.patch("/api/findings/:id", json(FindingPatch), (c) => {
    const finding = patchFinding(id(c), c.req.valid("json"));
    activeReply(finding.huntId)?.replaceFinding(finding);
    return c.json(finding);
  });

  app.get("/api/models", async (c) => c.json(await listModels()));
  app.get("/api/settings", (c) => c.json(getSettings()));
  app.put("/api/settings", json(Settings), (c) => c.json(putSettings(c.req.valid("json"))));

  app.all("/api/*", (c) => c.json({ error: "Not found." }, 404));

  // The built web app, with client-side routes falling back to index.html.
  const index = path.join(env.webDist, "index.html");
  if (fs.existsSync(index)) {
    const root = path.relative(process.cwd(), env.webDist);
    app.use("/assets/*", serveStatic({ root, onFound: (_p, c) => c.header("Cache-Control", "public, max-age=31536000, immutable") }));
    app.use("*", serveStatic({ root }));
    app.get("*", (c) => c.html(fs.readFileSync(index, "utf8")));
  }

  return app;
}
