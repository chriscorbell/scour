# Scour

Read `README.md` for what Scour is, how it's built, and how to run it, and `docs/api.md` for the API.

- Single user, tailnet only, no auth. Don't add anything that assumes other users.
- The agent runs through the Claude Agent SDK on Chris's subscription (`CLAUDE_CODE_OAUTH_TOKEN`), never an API key: `childEnv()` in `apps/server/src/agent/run.ts` strips `ANTHROPIC_API_KEY`.
- eBay access is the Buy Browse API with an application token. Search returns only fixed-price listings unless `buyingOptions` asks for auctions, an offset has to be a multiple of the limit, and there is no sold-price data. `apps/server/src/ebay/live.ts` has the details.
- Scour keeps no eBay user data, so its keyset can claim eBay's Marketplace Account Deletion exemption: `Listing.seller` has feedback only, never a username or user id. Keep it that way, or the app needs a deletion-notification endpoint instead.
- The shared types in `packages/core` are the contract between server and web app. Change both sides together, and update `docs/api.md` when an endpoint changes.
- Schema changes are a new entry in `MIGRATIONS` in `apps/server/src/db.ts`; never edit a shipped one.
- Work on a branch and open a pull request; merging to `main` deploys.
