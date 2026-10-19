# API

JSON over HTTP under `/api`. The types are in `packages/core/src/index.ts`. There is no auth: the server listens on loopback and is reached only through Tailscale Serve, on the tailnet.

Errors are `{ "error": "<sentence for a person>", "details"?: ... }` with a 4xx or 5xx status.

| Method and path | Body | Returns |
| --- | --- | --- |
| `GET /api/health` | | `Health` |
| `GET /api/hunts` | | `HuntSummary[]`, most recently updated first |
| `POST /api/hunts` | `MessageRequest` | A reply stream. Creates the hunt from the text and starts the agent. |
| `GET /api/hunts/:id` | | `HuntView` |
| `DELETE /api/hunts/:id` | | `{ ok: true }`. 409 while the agent is replying. |
| `POST /api/hunts/:id/messages` | `MessageRequest` | A reply stream. 409 while the agent is still replying. |
| `GET /api/hunts/:id/stream` | | The reply being written, replayed from its beginning (no `start` event). 409 when nothing is being written. |
| `POST /api/hunts/:id/stop` | | `{ ok: true }`. Stops the reply; it finishes with status `stopped`, keeping its findings. |
| `PATCH /api/findings/:id` | `FindingPatch` | `Finding` |
| `GET /api/settings` | | `Settings` |
| `PUT /api/settings` | `Settings` | `Settings` |

## Reply streams

Server-sent events. Each event's name is its `type`, and its data is the JSON `HuntStreamEvent`. A POST stream begins with `start`, then any of `hunt`, `status`, `activity`, `delta` and `finding`, and always ends with `done`. Comment lines (`: ping`) keep the connection alive.

A reply keeps running when its stream closes. To pick it back up, for example after a reload, check `running` on the hunt and open `GET /api/hunts/:id/stream`.

Findings arrive as the agent vets them, before its written reply. A `finding` event for an id already on the page replaces it; `withdrawnReason` set means the agent took it back.
