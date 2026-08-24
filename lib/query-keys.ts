export const queryKeys = {
  me: ["me"] as const,
  campaigns: ["campaigns"] as const,
  missions: (campaignId: string, scope: "public" | "editorial" = "public") =>
    ["campaigns", campaignId, "missions", scope] as const,
  posts: (campaignId: string, scope: "public" | "editorial" = "public") =>
    ["campaigns", campaignId, "posts", scope] as const,
  members: (campaignId: string) => ["campaigns", campaignId, "members"] as const,
  audit: (campaignId: string) => ["campaigns", campaignId, "audit"] as const,
  automations: (campaignId: string) =>
    ["campaigns", campaignId, "automations"] as const,
  campaignSessions: (campaignId: string) =>
    ["campaigns", campaignId, "sessions"] as const,
  campaignSessionOptions: (campaignId: string) =>
    ["campaigns", campaignId, "sessions", "options"] as const,
  foundryWorlds: (campaignId: string) =>
    ["campaigns", campaignId, "foundry", "worlds"] as const,
} as const;
