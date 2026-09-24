const TIME_ZONE = "America/Sao_Paulo";

/** 23 de set. de 2026 */
export function formatDate(value: string | null | undefined, fallback = "A definir"): string {
  if (!value) return fallback;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeZone: TIME_ZONE,
  }).format(new Date(value));
}

/** 23 de set. de 2026, 20:30 */
export function formatDateTime(value: string | null | undefined, fallback = "—"): string {
  if (!value) return fallback;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: TIME_ZONE,
  }).format(new Date(value));
}

/** "hoje", "em 3 dias", "há 2 meses" — usado como apoio, nunca sozinho. */
export function formatRelative(value: string | null | undefined): string | null {
  if (!value) return null;
  const target = new Date(value).getTime();
  if (Number.isNaN(target)) return null;
  const days = Math.round((target - Date.now()) / 86_400_000);
  if (days === 0) return "hoje";
  const relative = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  if (Math.abs(days) < 30) return relative.format(days, "day");
  if (Math.abs(days) < 365) return relative.format(Math.round(days / 30), "month");
  return relative.format(Math.round(days / 365), "year");
}

/** Remove acentos e caixa para comparar texto digitado com conteúdo. */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

/** Primeiro parágrafo de um texto longo, para prévias em listas. */
export function excerpt(body: string, maxLength = 220): string {
  const firstParagraph = body.split(/\n{2,}/)[0] ?? body;
  const clean = firstParagraph.replace(/\s+/g, " ").trim();
  return clean.length <= maxLength ? clean : `${clean.slice(0, maxLength - 1).trimEnd()}…`;
}
