import { expect, it } from "vitest";
import { toAgentModels } from "../src/agent/models.ts";

const all = ["low", "medium", "high", "xhigh", "max"] as const;

it("lists each model once, with its version in the name", () => {
  const models = toAgentModels([
    { value: "default", resolvedModel: "claude-opus-5-5", displayName: "Default (recommended)", description: "Opus 5.5 · Best for everyday, complex tasks", supportsEffort: true, supportedEffortLevels: [...all] },
    { value: "opus", resolvedModel: "claude-opus-5-5", displayName: "Opus", description: "Opus 5.5 · Best for everyday, complex tasks", supportsEffort: true, supportedEffortLevels: [...all] },
    { value: "claude-opus-5-5", displayName: "Opus 5.5", description: "Duplicate", supportsEffort: true, supportedEffortLevels: [...all] },
    { value: "sonnet", resolvedModel: "claude-sonnet-5-5", displayName: "Sonnet 5.5", description: "Most efficient for simpler tasks", supportsEffort: true, supportedEffortLevels: [...all] },
    { value: "claude-haiku-4-5-20251001", displayName: "Haiku 4.5", description: "Fastest for quick answers" },
  ]);
  expect(models).toEqual([
    { id: "claude-opus-5-5", name: "Opus 5.5", description: "Best for everyday, complex tasks", efforts: [...all] },
    { id: "claude-sonnet-5-5", name: "Sonnet 5.5", description: "Most efficient for simpler tasks", efforts: [...all] },
    { id: "claude-haiku-4-5-20251001", name: "Haiku 4.5", description: "Fastest for quick answers", efforts: [] },
  ]);
});
