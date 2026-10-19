// A reply: Chris's message is saved, then the agent hunts on its own, so a reply finishes and is saved
// even if the page that asked goes away. Clients follow it as a stream of events (replies.ts).
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { createSdkMcpServer, query } from "@anthropic-ai/claude-agent-sdk";
import type { HuntStreamEvent, MessageStatus } from "@scour/core";
import { env } from "../env.ts";
import { HttpError } from "../http.ts";
import { createHunt, finishMessage, huntRow, huntSummary, insertMessage, saveActivity, touchHunt } from "../store.ts";
import { mockConverse } from "./mock.ts";
import { SYSTEM, turnPrompt } from "./prompt.ts";
import { activeReply, addReply, isRunning, removeReply, Reply } from "./replies.ts";
import { huntTools } from "./tools.ts";

const workdir = path.join(os.tmpdir(), "scour-agent");
fs.mkdirSync(workdir, { recursive: true });

const TIME_LIMIT_MS = 15 * 60_000;

/**
 * The SDK replaces the child's environment when `env` is set, so pass ours through. An API key would
 * outrank the subscription token, and only the subscription is meant to be used here.
 */
function childEnv(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: `scour/${env.version}` };
  delete out.ANTHROPIC_API_KEY;
  delete out.ANTHROPIC_AUTH_TOKEN;
  return out;
}

/** A provisional title from the request, until the agent names the hunt. */
const titleFrom = (text: string) => {
  const line = text.trim().split("\n")[0]!;
  return line.length > 48 ? `${line.slice(0, 47).trimEnd()}…` : line;
};

/** Saves Chris's message and starts the agent's reply. Throws before saving anything when it can't. */
export function startReply(text: string, huntId?: number): { reply: Reply; start: HuntStreamEvent } {
  if (huntId != null) {
    huntRow(huntId);
    if (isRunning(huntId)) throw new HttpError(409, "The agent is still working on this hunt.");
  }
  const hunt = huntId != null ? huntRow(huntId) : createHunt(titleFrom(text));
  const message = insertMessage(hunt.id, "user", text, "done");
  const pending = insertMessage(hunt.id, "agent", "", "pending");
  touchHunt(hunt.id);
  const reply = new Reply(hunt.id, pending.id);
  addReply(reply);
  reply.subscribe((e) => e.type === "activity" && saveActivity(reply.messageId, reply.activity));
  void run(reply, huntId == null);
  return { reply, start: { type: "start", hunt: huntSummary(hunt.id), message, reply: pending } };
}

export function stopReply(huntId: number) {
  const reply = activeReply(huntId);
  if (!reply) throw new HttpError(409, "The agent isn't working on this hunt.");
  reply.abort.abort("stopped");
}

async function run(reply: Reply, firstTurn: boolean) {
  let status: MessageStatus = "done";
  let error: string | null = null;
  const started = Date.now();
  const timer = setTimeout(() => reply.abort.abort("timeout"), TIME_LIMIT_MS);
  try {
    reply.status("Reading your request");
    if (env.agent === "mock") await mockConverse(reply, firstTurn);
    else await converse(reply);
    if (!reply.text.trim()) throw new Error("The agent finished without writing a reply. Try asking again.");
    console.log(`[agent] hunt ${reply.huntId} replied in ${Math.round((Date.now() - started) / 1000)}s`);
  } catch (err) {
    const reason: unknown = reply.abort.signal.reason;
    if (reply.abort.signal.aborted && reason === "stopped") status = "stopped";
    else {
      status = "failed";
      error = reply.abort.signal.aborted ? "The agent ran out of time. Try again, or ask for something narrower." : err instanceof Error ? err.message : String(err);
      console.error(`[agent] hunt ${reply.huntId} failed:`, error);
    }
  } finally {
    clearTimeout(timer);
  }
  const message = finishMessage(reply.messageId, { text: reply.text.trim(), status, error, activity: reply.activity });
  removeReply(reply);
  touchHunt(reply.huntId);
  reply.emit({ type: "done", reply: message, hunt: huntSummary(reply.huntId) });
}

/** Streams finished text to the page a few words at a time, so the reply still types out. */
async function typeOut(reply: Reply, text: string) {
  if (reply.text) reply.delta("\n\n");
  const words = text.split(/(?<=\s)/);
  for (let i = 0; i < words.length; i += 3) {
    reply.delta(words.slice(i, i + 3).join(""));
    await new Promise((r) => setTimeout(r, 16));
  }
}

async function converse(reply: Reply) {
  const tools = huntTools(reply);
  const server = createSdkMcpServer({ name: "scour", version: env.version, tools, alwaysLoad: true });
  // Text the agent writes between tool calls is a progress note, not the reply, but that's only known when
  // its message ends. So each message's text is held until then: a note becomes the status line, and the
  // text of the message that ends the turn streams out as the reply.
  let held = "";
  let turns = 0;
  for await (const message of query({
    prompt: turnPrompt(reply.huntId, reply.messageId),
    options: {
      model: env.model,
      systemPrompt: SYSTEM,
      tools: ["WebSearch"],
      mcpServers: { scour: server },
      allowedTools: ["WebSearch", ...tools.map((t) => `mcp__scour__${t.name}`)],
      settingSources: [],
      persistSession: false,
      maxTurns: 60,
      effort: env.effort,
      includePartialMessages: true,
      cwd: workdir,
      env: childEnv(),
      abortController: reply.abort,
    },
  })) {
    if (message.type === "stream_event") {
      const event = message.event;
      if (event.type === "message_start") {
        held = "";
        if (turns++ > 0) reply.status("Thinking");
      }
      if (event.type === "content_block_start" && event.content_block.type === "text" && held) held += "\n\n";
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") held += event.delta.text;
      if (event.type === "message_delta" && held.trim()) {
        if (event.delta.stop_reason === "tool_use") reply.status(held.trim().replace(/\s+/g, " ").slice(0, 140));
        else await typeOut(reply, held.trim());
        held = "";
      }
    } else if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "tool_use" && block.name === "WebSearch") {
          const q = (block.input as { query?: unknown }).query;
          reply.status("Looking up product details");
          if (typeof q === "string") reply.log("lookup", `Looked up "${q}"`);
        }
      }
    } else if (message.type === "result" && message.subtype !== "success") {
      throw new Error(message.subtype === "error_max_turns" ? "The agent ran out of steps before finishing." : `The agent stopped: ${message.subtype}.`);
    }
  }
}
