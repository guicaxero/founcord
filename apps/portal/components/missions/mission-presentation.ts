import type { MissionSummary } from "@ordem/contracts";

export const riskLabels = {
  unknown: "Risco desconhecido",
  moderate: "Risco moderado",
  dangerous: "Perigosa",
  deadly: "Letal",
} as const;

export const riskTone = {
  unknown: "neutral",
  moderate: "info",
  dangerous: "warning",
  deadly: "danger",
} as const;

export type MissionAvailability = "recrutando" | "lista-de-espera";

export function availabilityOf(mission: MissionSummary): MissionAvailability {
  return mission.signupCount >= mission.partySize ? "lista-de-espera" : "recrutando";
}

export function isSignedUp(mission: MissionSummary): boolean {
  return mission.currentUserSignup === "confirmed" || mission.currentUserSignup === "waitlisted";
}

/** Rótulo da ação de inscrição, sempre descrevendo o resultado concreto. */
export function signupActionLabel(mission: MissionSummary): string {
  if (mission.currentUserSignup === "confirmed") return "Cancelar inscrição";
  if (mission.currentUserSignup === "waitlisted") return "Sair da lista de espera";
  return availabilityOf(mission) === "lista-de-espera"
    ? "Entrar na lista de espera"
    : "Inscrever-se";
}

/** Estado da pessoa na missão, para o selo do cartão. */
export function signupStatusLabel(mission: MissionSummary): string | null {
  if (mission.currentUserSignup === "confirmed") return "Você está confirmado";
  if (mission.currentUserSignup === "waitlisted") return "Você está na lista de espera";
  return null;
}
