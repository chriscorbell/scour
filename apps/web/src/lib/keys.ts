export const keys = {
  health: ["health"] as const,
  hunts: ["hunts"] as const,
  hunt: (id: number) => ["hunt", id] as const,
  settings: ["settings"] as const,
};
