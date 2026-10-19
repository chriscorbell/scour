// What every Agent SDK session Scour opens shares.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { env } from "../env.ts";

export const workdir = path.join(os.tmpdir(), "scour-agent");
fs.mkdirSync(workdir, { recursive: true });

/**
 * The SDK replaces the child's environment when `env` is set, so pass ours through. An API key would
 * outrank the subscription token, and only the subscription is meant to be used here.
 */
export function childEnv(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: `scour/${env.version}` };
  delete out.ANTHROPIC_API_KEY;
  delete out.ANTHROPIC_AUTH_TOKEN;
  return out;
}
