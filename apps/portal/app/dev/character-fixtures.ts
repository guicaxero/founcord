import type {
  CampaignCharacterLinkManagementResponse,
  CampaignMemberListResponse,
  FoundryWorldListResponse,
  PlayerCharacterListResponse,
} from "@ordem/contracts";

/** Retrato e token de prévia, no formato das miniaturas que o módulo envia. */
export const PREVIEW_PORTRAIT = "data:image/webp;base64,UklGRjwHAABXRUJQVlA4IDAHAACwHgCdASpgAGAAPpk6mEgloyIhMrhrMLATCWdjPlv1mF4e7K3RmH2387E5ZoNHkmqtFADyiv93yMftvqGdLj0TzWKazfiJvC/XGssiL3lQmg3XIJYY2tRmA8buXJs2G/eQ5pxDdlsf4YaeR9PAKDcxWTJJ4liX5KHcx0XAYdDy7aAjNXFP26wJnw3mAGB+Gu+atD7igq1eiDy2xj4zsE5NTIxeRBaBczFYlnsZcv1wX3hKPDYXVT7/CIXbAy87fYclzJQtF2S8nWoiz2x7zvMPtjQ3/c68z2EPCOYUi/PnrsRGXKTeWclTUCMc5eEhVdy8cNLY3jDWGrE6bBL6GAD+8iin85QNewt6c7dP+hRdTaQD/H4oSXk3v6SKBZqKJpvSrN/2TltHI0PC6R4K+vHp00gs9DBLsT43trodO9y0VgUJuw762hTOyEmb9D+grIwAeXlvk80WS72VcW3mocyehTdYu2DgXg7u41OZhCu3m/AhGBVRHjlRXV6uI0eDl3i/I4G7eJzR4ZPIC5SvHET8slIIbMOTopNROqtVHZTJ26pWZ7PNgQY4W22M49zfxCH0Qtttb/UZ1PA6Gs0fEjZb68ZP35srWOYB8CQy9y5OwV9R0Mj1xGjhCEU/1xrdG4Jq9t4bWGcXaNCxID+1dYWWB1OhyD+jNoNyhDe9J3i1c5rWwCNYfppgKBw1pM+VtzyNv3RJBZaIO84vIoS8tZQ/CJknjXEZl84JM2D9x+ZLEOa+w/IRRhs/W9280VPCTK+Olu82ZRulDY1bXE2GPat1BJs8KlOA7QyAWoDTcjdBuorwv+RTA1tqAf8XIOD59tQGHIXh2BJQQAE20HIqUMMBhUJZZnZ1LOoOxo2uN41DkPmqvDdyPvNdzUKDsJRqMLrM5jJbsKKZOq74BnZ9ZDczbPE8L58HIOiZgmOm97CtvXxSLYik8EISVhZPduOLW2DikL34MsJAT+5X0qM+AcInzI6ZzqpeiM/ebpY9Yd25N7cNsMMTc44Ky3FvXwI2wLSx+oN0UG19mehgc3fXzEp8i5CBCkerH18o3mFjfqbtWeIPwg+haPIOpqSOdXyJdyToR3ILkmh/Fj3GdzCkmE3l6tALWicTKOSTz0n58RFx+cT3FXaooXqdhgCBP80EK0GOHO/JYQowP/OfSJMU2fUZJJy5feVbGmtpMfuVDtyu9Vzm+7vej76CHGZzwqrzM5r9GO7wwaanZMJsw8zvtRCwt6HpWd5ESeWmDxJ4DxXx+BMFK3mxtr4pfg4E5IMDyDFP9xjmI3ox4NDCAtVXD7ht3v9hF80QvcspMw7g80TqI2tJaf5OmnBQtYybjKxB9Uv3XZKaYblueMz5kdaWo3a8KPozDl6xbrSDmTfbndf19ll4Mkgh8oDWSfoI15pABd26diita8MNGFNKb4POyIOgOsQ7SHT1TQoAwuHHOrNNqlIZMRCR+LjkO9l4MC+uf+N8kPq8XOYGNsSoYQ9/Sn3gITD2C5mku8jJjGc3i29WYvWR8TEZuSBSc7iyD1vIhOmD53znaveLcjvWEZegSETdSepPIb2d+D5HxmzRsho/eZXJgvT4EYc4laK1tsZ+v4GeAPSE5fXAfrdgVmfJG3vEtZlB9tum1Z7tPPQ852AulymD69/VOOnJY/lVCFrDniifLXOax0zuPa2RM2ICgQDcNGwB1+jiUopIVxogzXHa6I0RW9wYJ3PGRV0I0rLXBnMSwe9ty8NGxQMSvqsD4nfueEqN1Cab27T7AQx2FidZXh87rAzcRYzs3A8+/mDKkfxvv+wDePH3gWYt7YUVHPs8inQMetTJb3Q5qiwhPp9ttFhTyQDsh5TF0beCxisnOc0bDBJGlSkD1h4V15C5W4ucTKZwRfwFW4Cv248dnVVbcGYpxwNSvYocpUkXCD8RzP4+rdkSvRTx5h1wcJ2EtLVm6RJzu4rLfVhddSxYJaVGK5eEj5fW6FAYJuXpkpdnOQ4gh8GErrLI/Rldf9Bix+ZTgZYAZaaH17i5jsM6Q7njIFbixMWksJxRC38dqnbZHx+Z7nOGgwJXLUvWXOVXhNG/ddiY8JA9KfSNcls08pIvJgtCwlhEl5cFTDg3ZJs4MNaHjdPW5Q5+mfh0Foyi0US987ezVZa/qwyQYNhHpP+5AwGkpDsVxb+Aob8p9p5S7llEsF0q7CnGTIAPa5jE5zWq8w2y0V1kfEqGDUt4ZXZr/KZCySHg6zk2WR4BjUDhoBVan/IYgEX78qj12oJP5DNUh/IFaJOQBXxrjsG03ceaci94A7JpUFob7B0f2/JBaj2VYdmc65hmt1R9Z7cNFdqyqw0w81wNIZzcNS1FQabG0BJiggcEtQCmU+1Jy3h7pLTvqtbwdHEELKIcajIYLGBcWKp8l0f8PHl6iq1xUcm0qBmJKVjkSPsIlgJSNdHXL39ipFaQ6eByUQSRKWiwAAAA";
export const PREVIEW_TOKEN = "data:image/webp;base64,UklGRtQEAABXRUJQVlA4WAoAAAAQAAAAPwAAPwAAQUxQSKoBAAABkFzbtmpFe3D/GI+WReAk4JQn4O4uQeCQQGkCSCTfXZo4fXe9752SJ/ee8wOIiAlA3W69N7ZQWNs5P99ZzS+M3W1h1jNT1BRRF6a72cRep8lw6pXiEPu6ShZXPitrfXmyXL1qp/G3R9bdn46F9hyxLHcbu7VHTHdvGrp3QmzPnhh5oImxvm/g1imxPr0ZqWePmO92RXBKxL7WGO43CfwRatCV4A6HUBUSWVJBX0noxwC1LGUl5veaxL70S8tJ+PR4cryu/2ZI8MR/RUlZAC1akm4B7pLo28C4rBFgQdYskJeVBTZkrQHbsjaBc1ln9WBb1iawIWsNyMvKAguyZoFxWSPAXVm3gRYt6bIJQEFSBgCmJY3/1+3J8Tr/Q0pOHL6v5Dz3U0tSVpQfPkt5j0BVllFUQRhwJbjDCPtLwneEdkr8Ck44dO9y2+lE1CvHvE5uIPp9zenyHkzePeFz9hhmb+5y2bkO020ZHqVumHd+uPbcbw6s9uZslYdhW31ctrH4vgEM1cukZ8ZLvFDg2jWR1VEuM+Md4N18Z2Qut7p9fr69mpsdudOEug1WUDggBAMAADAPAJ0BKkAAQAA+nUacSaWkIqEsGAmYsBOJZQC6CDOECeBt1WmASXzsnlrcD9JMzyk0/KGOhy+tC1albZ/zkoSYj/9VmupBPsJljooQ4+FmPTokbkplwl0pjtlxawKYvcp7JCuCXbWgX7pYkm7FDQurURnTx+2LCptyKUZMa8A+2SQA/vQvn5XLWzN9D72vfp1jHJMRX0g12AAH76xyam0WHMC61mz9o8gpCLSCRCUNVu/UK1fHEfpxZrTUXX22JB9pluybXQ/WHHEEP3A3GLxOd1N64kCJc0dhnqqriKhCwN/piMlTZBHS+oTkaGt/M+CZx8/GZW8KlWFdHw+jxQL8q4Pxc5Nbw02TJnIG8xp3/2Kv0UWhiQG+7nB/3ZEA8LAII10vPZ4HQNkxSuBp8fpZEedY1iPeCKr6PwugmgM3jc9hWheuKD3DBGC6vralrFqQ+W8s74SDzjUAs/F3sebLmxPMXALTI0Ldd98ki3yWlMF3gOYiAskeVmvi2J2R3d0o+bn5Kp8Nbdi2TA9C5jAPWXhelX01jOQqw+GtmfF4fJWWDzRL5lPoYhaFckHcBBGWo1OexAs+wp7HhvgLsGAf2XwPmDvOSXbrLfOm2dwdA731rGJeHfscXW5yTX3/NjYw8w0P3huzixXJvm+HlddK4rlTwu33tQKZFk8hFhz0ORLLsYGTUqsADcrAfQ8WNHGD+Y2ohN9qiAuZ+bohBXGBbqbdNv6dUmgWNMMm6iWKvjQ/YrnwmlIepNUCQjU6Ah4Lji51PnmuB9iURTwqU30NQ98TA+7pT7G+tDGKQBBk4jWRHdqx/8MV3p5Xd3aLl99zFdSlIUlyTU6WE/mfnhULyevvfhXjR25dLYECiVVS+wegGjIsJz/3XsuYRrLyaEvywcisw+oFqgoiuzeFCDu9HI9Y5OrOrJcqWxCPzzIeU8X4QxoZSLgVBL4gr4hpKfnH+ShQyD4nbshLTBA0+XjW7I3dNjjI9938WEXz3xEU7748Vbdcn/+9J0G2EiM1FzfAAAA=";

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
  portraitUrl: PREVIEW_PORTRAIT,
  tokenUrl: PREVIEW_TOKEN,
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
  // Só o token: a prévia mostra o personagem sem alternância de imagem.
  portraitUrl: null,
  tokenUrl: PREVIEW_TOKEN,
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
  registro: null,
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
        registro: null,
        character: vesper,
      },
    },
  ],
};
