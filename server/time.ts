export function toIsoDateTime(value: string | null): string | null {
  if (value === null) return null;
  if (value.includes("T")) return new Date(value).toISOString();
  return new Date(`${value.replace(" ", "T")}Z`).toISOString();
}

export function nowIso(): string {
  return new Date().toISOString();
}
