import type { Finding, FindingPatch, HuntSummary, HuntView } from "@scour/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { live } from "./client.ts";
import { endpoints } from "./endpoints.ts";
import { keys } from "./keys.ts";
import type { LiveState } from "./live.ts";

export function useHealth() {
  return useQuery({ queryKey: keys.health, queryFn: endpoints.health, staleTime: Infinity, retry: false });
}

/** The hunt list. Polls lightly while any hunt is running, so the live dots stay true. */
export function useHunts() {
  return useQuery({
    queryKey: keys.hunts,
    queryFn: endpoints.hunts,
    refetchInterval: (q) => (q.state.data?.some((h) => h.running) ? 5000 : false),
  });
}

export function useHunt(id: number) {
  return useQuery({
    queryKey: keys.hunt(id),
    queryFn: async ({ signal }) => live.reconcile(await endpoints.hunt(id, signal)),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  });
}

/** The transient state of a hunt's live reply: its status line, and whether a stream is open. */
export function useLive(id: number): LiveState {
  return useSyncExternalStore(live.subscribe, () => live.get(id));
}

export function useSettings() {
  return useQuery({ queryKey: keys.settings, queryFn: endpoints.settings, staleTime: 60_000 });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: endpoints.saveSettings,
    onSuccess: (s) => qc.setQueryData(keys.settings, s),
  });
}

/** Star or dismiss a finding, shown at once and rolled back if the server says no. */
export function usePatchFinding(huntId: number) {
  const qc = useQueryClient();
  const put = (f: Finding) => {
    live.setView(huntId, (v) => ({ ...v, findings: v.findings.map((x) => (x.id === f.id ? f : x)) }));
    live.syncCount(huntId);
  };
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: FindingPatch }) => endpoints.patchFinding(id, patch),
    onMutate: ({ id, patch }) => {
      const prev = qc.getQueryData<HuntView>(keys.hunt(huntId))?.findings.find((f) => f.id === id);
      if (prev) put({ ...prev, ...patch, updatedAt: new Date().toISOString() });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) put(ctx.prev);
    },
    onSuccess: put,
  });
}

export function useDeleteHunt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => endpoints.deleteHunt(id),
    onSuccess: (_res, id) => {
      qc.setQueryData<HuntSummary[]>(keys.hunts, (list) => list?.filter((h) => h.id !== id));
      qc.removeQueries({ queryKey: keys.hunt(id) });
    },
  });
}
