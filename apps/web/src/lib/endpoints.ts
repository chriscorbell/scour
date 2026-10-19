import type { Finding, FindingPatch, Health, HuntSummary, HuntView, Settings } from "@scour/core";
import { api, apiFetch } from "./api.ts";

const stream = { accept: "text/event-stream" };

export const endpoints = {
  health: () => api<Health>("/health"),
  hunts: () => api<HuntSummary[]>("/hunts"),
  hunt: (id: number, signal?: AbortSignal) => api<HuntView>(`/hunts/${id}`, { signal }),
  deleteHunt: (id: number) => api<{ ok: true }>(`/hunts/${id}`, { method: "DELETE" }),
  stopHunt: (id: number) => api<{ ok: true }>(`/hunts/${id}/stop`, { method: "POST" }),
  patchFinding: (id: number, patch: FindingPatch) => api<Finding>(`/findings/${id}`, { method: "PATCH", body: patch }),
  settings: () => api<Settings>("/settings"),
  saveSettings: (settings: Settings) => api<Settings>("/settings", { method: "PUT", body: settings }),

  /** Reply streams. Each throws an ApiError before anything streams (409 while the agent is still replying). */
  createHunt: (text: string, signal: AbortSignal) => apiFetch("/hunts", { method: "POST", body: { text }, signal, ...stream }),
  sendMessage: (id: number, text: string, signal: AbortSignal) =>
    apiFetch(`/hunts/${id}/messages`, { method: "POST", body: { text }, signal, ...stream }),
  /** 409 when nothing is being written. */
  followHunt: (id: number, signal: AbortSignal) => apiFetch(`/hunts/${id}/stream`, { signal, ...stream }),
};
