# Scour

A self-hosted eBay scout for one person. Tell it what you're looking for ("a ThinkCentre M920q under $150 with the power adapter") and an agent searches eBay's live listings, opens the promising ones, checks their photos, and puts the ones worth buying on the page while it works, each with a verdict and its reasons. Follow up to narrow the hunt ("only US sellers"), and star or dismiss findings as you go. Hunts are saved, so you can come back to one later and ask the agent to look again.

The agent is Claude, running on your Claude subscription through the Agent SDK. It reads eBay through the Buy Browse API with your own developer keys.

## How it works

| Part | Where | What it does |
| --- | --- | --- |
| Shared types | `packages/core` | The shapes the server and the web app share |
| Server | `apps/server` | Hono API, SQLite (Node's built-in driver), the eBay client, and the agent with its tools. It also serves the web app |
| Web app | `apps/web` | Vite + React |

Each reply runs on the server on its own and streams to the page as server-sent events: what the agent is doing, the searches it ran, each finding as soon as it's vetted, then its written summary. Closing the page doesn't stop it. The API is in [docs/api.md](docs/api.md).

The agent's tools (`apps/server/src/agent/tools.ts`) search eBay with filters, open a listing (item specifics, condition notes, the seller's description, shipping, returns), look at its photos, put a finding on the page or take one back, and name the hunt. It can also search the web for product facts. eBay's API has no sold prices, so the agent compares against current listings.

## Development

You need Node 24 and pnpm 12.

```sh
pnpm install
cp apps/server/.env.example apps/server/.env   # then add your eBay keys
pnpm --filter @scour/server dev                 # API on :3120, reloads on change
pnpm --filter @scour/web dev                    # web app on :5180, proxies /api to :3120
```

Locally the agent uses your `claude` login. For UI work without eBay or Claude, run the server with `SCOUR_EBAY=mock SCOUR_AGENT=mock`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` | | The production App ID and Cert ID from developer.ebay.com. Required unless `SCOUR_EBAY=mock` |
| `CLAUDE_CODE_OAUTH_TOKEN` | | A `claude setup-token` token, for the server. Not needed locally |
| `SCOUR_EBAY` | `live` | `mock` uses built-in sample listings |
| `SCOUR_AGENT` | `claude` | `mock` streams a scripted hunt |
| `SCOUR_MODEL` | `claude-opus-5-5` | The agent's model, until it's changed in Settings |
| `SCOUR_EFFORT` | `high` | The agent's reasoning effort (`low` to `max`), until it's changed in Settings |
| `TZ` | `America/New_York` | Time zone for the times the agent reads, such as auction endings |
| `PORT` | `3120` | HTTP port |
| `SCOUR_DATA_DIR` | `apps/server/data` | Where the SQLite database lives |

`pnpm typecheck` and `pnpm test` check everything.

## Deployment

A push to `main` builds `ghcr.io/chriscorbell/scour:latest`. It runs on `minicore` from the `scour` stack in the fleet repo, listening on loopback; Tailscale Serve gives it HTTPS on the tailnet only, at `https://minicore.saanen-monitor.ts.net:3120`. Watchtower picks up each new image. There's no login: being on the tailnet is the access control.
