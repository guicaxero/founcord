import type { MissionStatus, PostStatus, SessionSummaryStatus } from "@ordem/contracts";

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

type EditorialStatus = MissionStatus | PostStatus | SessionSummaryStatus;

/** Cor de apoio do estado editorial; o rótulo textual sempre acompanha. */
export const editorialTone: Readonly<Record<EditorialStatus, Tone>> = {
  draft: "neutral",
  pending_review: "warning",
  approved: "info",
  published: "success",
  archived: "neutral",
  rejected: "danger",
};

/** Ordem natural do fluxo, usada para ordenar a coluna de situação. */
export const editorialOrder: Readonly<Record<EditorialStatus, number>> = {
  pending_review: 0,
  approved: 1,
  draft: 2,
  rejected: 3,
  published: 4,
  archived: 5,
};

export function timestamp(value: string | null | undefined): number {
  return value ? new Date(value).getTime() : 0;
}
