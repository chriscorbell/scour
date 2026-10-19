// Thin fetch wrapper for the Scour API. Same origin in production; Vite proxies /api in dev.

export class ApiError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

/** Resolves with the raw response when it's OK, throws an ApiError otherwise. For event streams too. */
export async function apiFetch(
  path: string,
  { method = "GET", body, signal, accept = "application/json" }: RequestOptions & { accept?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = { Accept: accept };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (isAbort(e)) throw e;
    throw new ApiError(0, "Can't reach the server");
  }

  if (!res.ok) {
    const err = (await readJson(res)) as { error?: string; details?: unknown } | null;
    throw new ApiError(res.status, err?.error ?? `Request failed (${res.status})`, err?.details);
  }
  return res;
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await apiFetch(path, options);
  return (await readJson(res)) as T;
}

export const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

/** Human message for any thrown value. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 400 && Array.isArray(e.details) && e.details.length > 0) {
      const first = e.details[0] as { message?: string };
      if (first?.message) return first.message;
    }
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}
