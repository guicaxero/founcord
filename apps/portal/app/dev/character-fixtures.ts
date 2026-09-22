import type {
  CampaignCharacterLinkManagementResponse,
  CampaignMemberListResponse,
  FoundryWorldListResponse,
  PlayerCharacterListResponse,
} from "@ordem/contracts";

export const previewCampaignId = "11111111-1111-4111-8111-111111111111";
const previewWorldId = "22222222-2222-4222-8222-222222222222";
const ownerId = "22222222-2222-4222-8222-222222222222";
const playerId = "dddddddd-4444-4444-8444-dddddddddddd";

const alaric = {
  worldId: previewWorldId,
  actorId: "alaric-001",
  name: "Alaric, Portador da Cinza",
  level: 4,
  ancestry: "Humano",
  paths: {
    novice: "Sacerdote",
    expert: "Oráculo",
    master: null,
    legendary: null,
  },
  statistics: {
    healthMax: 24,
    damage: 6,
    healingRate: 6,
    insanity: 2,
    corruption: 1,
  },
  wealth: { gc: 2, ss: 7, cp: 14, bits: 3 },
  sourceUpdatedAt: "2026-09-07T15:00:00.000Z",
  lastSyncedAt: "2026-09-07T15:01:00.000Z",
  active: true,
} as const;

const vesper = {
  worldId: previewWorldId,
  actorId: "vesper-002",
  name: "Vesper do Véu Partido",
  level: 3,
  ancestry: "Cambiante",
  paths: {
    novice: "Mágico",
    expert: null,
    master: null,
    legendary: null,
  },
  statistics: {
    healthMax: 17,
    damage: 4,
    healingRate: 4,
    insanity: 3,
    corruption: 2,
  },
  // Personagem sincronizado por um módulo anterior à 0.6.0: saldo desconhecido.
  wealth: null,
  sourceUpdatedAt: "2026-09-07T15:00:00.000Z",
  lastSyncedAt: "2026-09-07T15:01:00.000Z",
  active: true,
} as const;

const link = {
  id: "33333333-3333-4333-8333-333333333333",
  campaignId: previewCampaignId,
  userId: playerId,
  worldId: previewWorldId,
  actorId: alaric.actorId,
  actorName: alaric.name,
  createdAt: "2026-09-07T15:02:00.000Z",
  updatedAt: "2026-09-07T15:02:00.000Z",
  character: alaric,
} as const;

export const previewCharacterMembers: CampaignMemberListResponse = {
  data: [
    {
      campaignId: previewCampaignId,
      user: {
        id: ownerId,
        discordUserId: "preview-owner",
        displayName: "Guardião da Chama AP",
        avatarUrl: null,
      },
      status: "active",
      roles: ["campaign_manager"],
      joinedAt: "2026-08-01T00:00:00.000Z",
    },
    {
      campaignId: previewCampaignId,
      user: {
        id: playerId,
        discordUserId: "preview-player",
        displayName: "Alaric da Cinza",
        avatarUrl: null,
      },
      status: "active",
      roles: ["player"],
      joinedAt: "2026-08-18T00:00:00.000Z",
    },
  ],
};
export const previewCharacterLinks: CampaignCharacterLinkManagementResponse = {
  data: { links: [link], candidates: [alaric, vesper] },
};

export const previewCharacterWorlds: FoundryWorldListResponse = {
  data: [
    {
      worldId: previewWorldId,
      campaignId: previewCampaignId,
      worldTitle: "Fortaleza da Última Luz",
      foundryWorldId: "ordem-da-ultima-luz",
      foundryVersion: "14.367",
      systemVersion: "6.1.4",
      moduleVersion: "0.4.0",
      status: "online",
      lastSeenAt: "2026-09-07T15:01:00.000Z",
      activeUsers: 4,
      actorCount: 28,
      registeredAt: "2026-08-23T12:00:00.000Z",
    },
  ],
};

export const previewPlayerCharacters: PlayerCharacterListResponse = {
  data: [
    {
      campaign: { id: previewCampaignId, name: "Ordem da Última Luz" },
      link,
    },
    {
      campaign: { id: "44444444-4444-4444-8444-444444444444", name: "Expedição do Inverno Cinzento" },
      link: {
        ...link,
        id: "55555555-5555-4555-8555-555555555555",
        campaignId: "44444444-4444-4444-8444-444444444444",
        actorId: vesper.actorId,
        actorName: vesper.name,
        character: vesper,
      },
    },
  ],
};
