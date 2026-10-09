import { describe, expect, it } from "vitest";
import { MissionDiscordPublishInputSchema, announcementDate, missionAnnouncement } from "./mission-discord";

const mission = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Missão Nº 002 - Ecos na Floresta",
  region: "Floresta próxima à Ordem",
  summary: "Investigar o desaparecimento de caçadores na floresta.",
  partySize: 5,
  scheduledFor: "2026-10-08T22:00:00.000Z",
  estimatedDuration: "1-3 sessões",
};

describe("publicação de missões no Discord", () => {
  it("monta o chamado no formato da Ordem", () => {
    expect(missionAnnouncement(mission, "Iniciante e Novato", "https://portal.example/")).toBe(
      [
        "🎯 Missão Nº 002 - Ecos na Floresta",
        "",
        "Grau: Iniciante e Novato",
        "Local: Floresta próxima à Ordem",
        "Participantes: 5 vagas",
        "Data: 08/10/2026 - 19h",
        "Duração estimada: 1-3 sessões",
        "",
        "Objetivo: Investigar o desaparecimento de caçadores na floresta.",
        "",
        "Inscrições no portal: https://portal.example/missoes/11111111-1111-4111-8111-111111111111",
      ].join("\n"),
    );
  });

  it("omite grau, data e duração quando não há", () => {
    const text = missionAnnouncement({ ...mission, scheduledFor: null, estimatedDuration: null }, " ", "https://p.example");
    expect(text).not.toMatch(/Grau:|Data:|Duração/u);
  });

  it("mostra os minutos só quando não é hora cheia", () => {
    expect(announcementDate("2026-10-08T22:30:00.000Z")).toBe("08/10/2026 - 19h30");
  });

  it("aceita até 5 tags e só avatar HTTPS", () => {
    const base = { forumChannelId: "1500000000000000003", tagIds: [], content: "Texto" };
    expect(MissionDiscordPublishInputSchema.parse(base)).toMatchObject({ personaName: null, personaAvatarUrl: null });
    const six = Array.from({ length: 6 }, (_, index) => `150000000000000000${index}`);
    expect(MissionDiscordPublishInputSchema.safeParse({ ...base, tagIds: six }).success).toBe(false);
    expect(MissionDiscordPublishInputSchema.safeParse({ ...base, personaAvatarUrl: "http://x.example/a.png" }).success).toBe(false);
  });
});
