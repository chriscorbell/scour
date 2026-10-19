// The models Scour's Claude account offers, read from the Agent SDK, for the model picker in Settings.
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { AgentModel } from "@scour/core";
import { env } from "../env.ts";
import { HttpError } from "../http.ts";
import { childEnv, workdir } from "./sdk.ts";

const TTL_MS = 60 * 60_000;

const MOCK_MODELS: AgentModel[] = [
  { id: "claude-opus-5-5", name: "Opus 5.5", description: "For complex work and everyday tasks", efforts: ["low", "medium", "high", "xhigh", "max"] },
  { id: "claude-sonnet-5-5", name: "Sonnet 5.5", description: "Most efficient for simpler tasks", efforts: ["low", "medium", "high", "xhigh", "max"] },
  { id: "claude-haiku-5-5", name: "Haiku 5.5", description: "Fastest for quick answers", efforts: ["low", "medium", "high", "xhigh", "max"] },
];

let cached: { at: number; models: Promise<AgentModel[]> } | null = null;

export function listModels(): Promise<AgentModel[]> {
  if (env.agent === "mock") return Promise.resolve(MOCK_MODELS);
  if (!cached || Date.now() - cached.at > TTL_MS) {
    const models = fetchModels();
    cached = { at: Date.now(), models };
    models.catch(() => {
      if (cached?.models === models) cached = null;
    });
  }
  return cached.models;
}

async function fetchModels(): Promise<AgentModel[]> {
  // A session that's never sent a prompt, opened only to ask for the model list.
  const q = query({ prompt: idle(), options: { settingSources: [], persistSession: false, tools: [], cwd: workdir, env: childEnv() } });
  try {
    const rows = await q.supportedModels();
    const models = new Map<string, AgentModel>();
    // "default" repeats another row under a different name; the settings already have their own default.
    for (const row of rows.filter((r) => r.value !== "default")) {
      const id = row.resolvedModel ?? row.value;
      if (!models.has(id)) models.set(id, { id, name: row.displayName, description: row.description, efforts: row.supportsEffort ? (row.supportedEffortLevels ?? []) : [] });
    }
    return [...models.values()];
  } catch (err) {
    console.error("[agent] couldn't list models:", err);
    throw new HttpError(502, "Couldn't load the model list from Claude.");
  } finally {
    q.close();
  }
}

async function* idle(): AsyncGenerator<never> {
  await new Promise(() => {});
}
