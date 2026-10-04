export const queryKeys = {
  me: ["me"] as const,
  campaigns: ["campaigns"] as const,
  missions: (campaignId: string, scope: "public" | "editorial" = "public") =>
    ["campaigns", campaignId, "missions", scope] as const,
  posts: (campaignId: string, scope: "public" | "editorial" = "public") =>
    ["campaigns", campaignId, "posts", scope] as const,
  sessionSummaries: (campaignId: string, scope: "public" | "editorial" = "public") =>
    ["campaigns", campaignId, "session-summaries", scope] as const,
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
  merchant: (campaignId: string) =>
    ["campaigns", campaignId, "merchant"] as const,
  merchantPurchases: (campaignId: string) =>
    ["campaigns", campaignId, "merchant", "purchases"] as const,
  merchantCatalog: (campaignId: string) =>
    ["campaigns", campaignId, "merchant", "catalog"] as const,
  merchantStockDraws: (campaignId: string) =>
    ["campaigns", campaignId, "merchant", "stock", "draws"] as const,
  merchantStockTargets: (campaignId: string) =>
    ["campaigns", campaignId, "merchant", "stock", "targets"] as const,
  creatures: (campaignId: string) =>
    ["campaigns", campaignId, "creatures"] as const,
  creature: (campaignId: string, creatureId: string) =>
    ["campaigns", campaignId, "creatures", "item", creatureId] as const,
  creatureTargets: (campaignId: string) =>
    ["campaigns", campaignId, "creature-targets"] as const,
  compendium: (campaignId: string, kind: "creature" | "spell") =>
    ["campaigns", campaignId, "compendium", kind] as const,
  compendiumEntry: (campaignId: string, entryId: string) =>
    ["campaigns", campaignId, "compendium", "entry", entryId] as const,
  registroThreads: (campaignId: string) => ["campaigns", campaignId, "registro-threads"] as const,
  characterLinks: (campaignId: string) =>
    ["campaigns", campaignId, "character-links"] as const,
  sede: (campaignId: string) => ["campaigns", campaignId, "sede"] as const,
  sedeManage: (campaignId: string) => ["campaigns", campaignId, "sede", "manage"] as const,
  sedeShop: (campaignId: string, activityId: string) => ["campaigns", campaignId, "sede", "shop", activityId] as const,
  myCharacters: ["me", "characters"] as const,
  myCharacterSheet: (campaignId: string) => ["me", "characters", campaignId, "sheet"] as const,
} as const;
