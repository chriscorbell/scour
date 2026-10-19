import os from "node:os";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: { SCOUR_EBAY: "mock", SCOUR_AGENT: "mock", SCOUR_DATA_DIR: path.join(os.tmpdir(), `scour-test-${process.pid}`) },
  },
});
