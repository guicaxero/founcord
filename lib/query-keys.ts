export const queryKeys = {
  me: ["me"] as const,
  campaigns: ["campaigns"] as const,
  missions: (campaignId: string, scope: "public" | "editorial" = "public") =>
    ["campaigns", campaignId, "missions", scope] as const,
  posts: (campaignId: string, scope: "public" | "editorial" = "public") =>
    ["campaigns", campaignId, "posts", scope] as const,
  members: (campaignId: string) => ["campaigns", campaignId, "members"] as const,
  audit: (campaignId: string) => ["campaigns", campaignId, "audit"] as const,
} as const;
