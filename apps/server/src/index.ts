import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { db, migrate } from "./db.ts";
import { env } from "./env.ts";
import { failInterruptedReplies } from "./store.ts";

migrate();
failInterruptedReplies();

const server = serve({ fetch: createApp().fetch, port: env.port, hostname: env.host }, (info) => {
  console.log(`Scour ${env.version} listening on http://${info.address}:${info.port} (agent: ${env.agent}, eBay: ${env.ebay})`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
