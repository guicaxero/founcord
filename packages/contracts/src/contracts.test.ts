import { describe, expect, it } from "vitest";
import {
  CampaignCharacterLinkInputSchema,
  CreateCampaignSessionSchema,
  CreateDiscordPostDraftSchema,
  CreateMissionSchema,
  FoundryCharacterSyncRequestSchema,
  FoundryChatBatchRequestSchema,
  FoundryCommandCreateRequestSchema,
  FoundryMerchantSyncRequestSchema,
  FoundryPairingCreateRequestSchema,
  FoundryUserCodeSchema,
  UpdatePostSchema,
} from "./index";

describe("contratos públicos", () => {
  it("aceita somente referências explícitas no vínculo de personagem", () => {
    expect(
      CampaignCharacterLinkInputSchema.parse({
        worldId: "world-001",
        actorId: "actor-001",
      }),
    ).toEqual({ worldId: "world-001", actorId: "actor-001" });
    expect(() =>
      CampaignCharacterLinkInputSchema.parse({
        worldId: "world-001",
        actorId: "actor-001",
        userId: "não-pode-ser-escolhido-pelo-cliente",
      }),
    ).toThrow();
  });

  it("normaliza uma missão válida", () => {
    const mission = CreateMissionSchema.parse({
      campaignId: "11111111-1111-4111-8111-111111111111",
      title: "  Torre sem sombra  ",
      summary: "Há uma luz onde não deveria.",
      region: "Ermos",
    });
    expect(mission.title).toBe("Torre sem sombra");
    expect(mission.partySize).toBe(5);
  });

  it("exige versão otimista nas mudanças editoriais", () => {
    expect(() => UpdatePostSchema.parse({ status: "published" })).toThrow();
    expect(() => UpdatePostSchema.parse({ version: 1 })).toThrow();
  });

  it("aceita somente identidade narrativa segura para o Discord", () => {
    const base = {
      campaignId: "11111111-1111-4111-8111-111111111111",
      interactionId: "123456789012345678",
      discordUserId: "223456789012345678",
      guildId: "323456789012345678",
      channelId: "423456789012345678",
      forumChannelId: "523456789012345678",
      forumTagId: null,
      personaName: "Aster",
      title: "Sinais no ermo",
      body: "A chama foi vista ao norte.",
    };
    expect(CreateDiscordPostDraftSchema.parse({
      ...base,
      personaAvatarUrl: "https://cdn.example/aster.png",
    }).personaAvatarUrl).toBe("https://cdn.example/aster.png");
    expect(() => CreateDiscordPostDraftSchema.parse({
      ...base,
      personaAvatarUrl: "http://localhost/avatar.png",
    })).toThrow();
    expect(() => CreateDiscordPostDraftSchema.parse({
      ...base,
      personaName: "Aster\nNarrador",
    })).toThrow();
  });

  it("aceita somente projeções sanitizadas de personagens do Demon Lord", () => {
    const sync = FoundryCharacterSyncRequestSchema.parse({
      syncId: "22222222-2222-4222-8222-222222222222",
      capturedAt: "2026-08-23T02:00:00.000Z",
      characters: [
        {
          actorId: "aster-001",
          name: "Aster",
          type: "character",
          ownerUserIds: ["user-001"],
          level: 2,
          ancestry: "Humano",
          paths: {
            novice: "Guerreiro",
            expert: null,
            master: null,
            legendary: null,
          },
          statistics: {
            healthMax: 18,
            damage: 3,
            healingRate: 4,
            insanity: 1,
            corruption: 0,
          },
          sourceUpdatedAt: "2026-08-23T01:59:00.000Z",
        },
      ],
    });
    expect(sync.characters[0]?.name).toBe("Aster");
    expect(() =>
      FoundryCharacterSyncRequestSchema.parse({
        ...sync,
        characters: [{ ...sync.characters[0], gmNotes: "segredo" }],
      }),
    ).toThrow();
  });

  it("não permite comandos arbitrários no Foundry", () => {
    expect(() =>
      FoundryCommandCreateRequestSchema.parse({
        command: { type: "macro.execute", payload: { script: "game.users" } },
      }),
    ).toThrow();
    expect(
      FoundryCommandCreateRequestSchema.parse({
        command: { type: "actor.sync.request", payload: {} },
      }).command.type,
    ).toBe("actor.sync.request");
  });

  it("distingue estoque desconhecido, esgotado e disponível no Mercador", () => {
    const baseItem = {
      name: "Tocha",
      description: null,
      category: "Equipamento",
      imageUrl: null,
      price: "1 cp",
      sourceUpdatedAt: "2026-08-31T12:00:00.000Z",
    };
    const sync = FoundryMerchantSyncRequestSchema.parse({
      syncId: "12121212-1212-4212-8212-121212121212",
      capturedAt: "2026-08-31T12:00:00.000Z",
      catalog: {
        merchantActorId: "merchant-001",
        merchantName: "Intendente da Ordem",
        sourceUpdatedAt: "2026-08-31T12:00:00.000Z",
        items: [
          { ...baseItem, itemId: "unknown", quantity: null },
          { ...baseItem, itemId: "sold-out", quantity: 0 },
          { ...baseItem, itemId: "available", quantity: 3 },
        ],
      },
    });
    expect(sync.catalog.items.map((item) => item.quantity)).toEqual([null, 0, 3]);
    expect(() =>
      FoundryMerchantSyncRequestSchema.parse({
        ...sync,
        catalog: {
          ...sync.catalog,
          items: [{ ...baseItem, itemId: "negative", quantity: -1 }],
        },
      }),
    ).toThrow();
  });

  it("inicia pareamento sem aceitar campanha escolhida pelo Foundry", () => {
    const identity = {
      worldInstanceId: "33333333-3333-4333-8333-333333333333",
      foundryWorldId: "ordem-da-ultima-luz",
      worldTitle: "Ordem da Última Luz",
      systemId: "demonlord",
      foundryVersion: "14.320",
      systemVersion: "6.1.4",
      moduleVersion: "0.2.0",
    };
    expect(FoundryPairingCreateRequestSchema.parse(identity)).toEqual(identity);
    expect(() =>
      FoundryPairingCreateRequestSchema.parse({
        ...identity,
        campaignId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toThrow();
    expect(FoundryUserCodeSchema.parse("lume-7k4p-9q2m")).toBe(
      "LUME-7K4P-9Q2M",
    );
  });

  it("mantém o registro de sessão separado do conteúdo bruto", () => {
    const session = CreateCampaignSessionSchema.parse({
      campaignId: "11111111-1111-4111-8111-111111111111",
      title: "Sessão 12 — O moinho abandonado",
      worldId: "22222222-2222-4222-8222-222222222222",
    });
    expect(session.startNow).toBe(true);
    expect(session.notes).toBe("");
    expect(() =>
      CreateCampaignSessionSchema.parse({
        ...session,
        rawFoundryMessages: [{ content: "não pertence ao portal" }],
      }),
    ).toThrow();
  });

  it("aceita apenas lotes públicos e sanitizados do chat do Foundry", () => {
    const batch = FoundryChatBatchRequestSchema.parse({
      batchId: "99999999-9999-4999-8999-999999999999",
      capturedAt: "2026-08-24T20:00:00.000Z",
      messages: [
        {
          messageId: "chat-001",
          createdAt: "2026-08-24T19:59:59.000Z",
          authorUserId: "user-001",
          authorName: "Mestre",
          speakerActorId: null,
          speakerName: null,
          content: "A porta de ferro cede com um estrondo.",
          kind: "message",
        },
      ],
    });
    expect(batch.messages).toHaveLength(1);
    expect(() =>
      FoundryChatBatchRequestSchema.parse({
        ...batch,
        messages: [{ ...batch.messages[0], whisperUserIds: ["user-002"] }],
      }),
    ).toThrow();
  });
});
