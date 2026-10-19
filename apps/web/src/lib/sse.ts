// Reply streams are server-sent events (docs/api.md, "Reply streams"). EventSource can't POST, so streams
// are read from fetch.
import type { HuntStreamEvent } from "@scour/core";

/** The server pings every 10 s. This long without a byte means the connection is gone, even if a proxy
 * in between still holds it open (Vite's dev proxy does when the server restarts). */
const IDLE_MS = 25_000;

/**
 * Read events until `done` (resolves true) or the stream ends without one (resolves false, e.g. the
 * connection dropped or went quiet). Throws AbortError when the signal aborts.
 */
export async function readEvents(res: Response, onEvent: (event: HuntStreamEvent) => void): Promise<boolean> {
  if (!res.body) return false;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let name = "";
  let data: string[] = [];
  let idle: ReturnType<typeof setTimeout> | undefined;
  const watch = () => {
    clearTimeout(idle);
    idle = setTimeout(() => void reader.cancel().catch(() => {}), IDLE_MS);
  };

  try {
    for (;;) {
      watch();
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);

        // A blank line ends an event.
        if (line === "") {
          const event = data.length ? parse(name, data.join("\n")) : null;
          name = "";
          data = [];
          if (!event) continue;
          onEvent(event);
          if (event.type === "done") return true;
          continue;
        }
        // Keep-alive comment.
        if (line.startsWith(":")) continue;

        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        let v = colon === -1 ? "" : line.slice(colon + 1);
        if (v.startsWith(" ")) v = v.slice(1);
        if (field === "event") name = v;
        else if (field === "data") data.push(v);
      }
      if (done) return false;
    }
  } finally {
    clearTimeout(idle);
    reader.cancel().catch(() => {});
  }
}

function parse(name: string, json: string): HuntStreamEvent | null {
  try {
    const event = JSON.parse(json) as HuntStreamEvent;
    if (!event.type && name) (event as { type: string }).type = name;
    return event;
  } catch {
    return null;
  }
}
