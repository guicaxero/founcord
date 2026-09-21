import { getCloudflareContext } from "@opennextjs/cloudflare";

export function getD1(): D1Database {
  const { env } = getCloudflareContext();
  if (!env.DB) {
    throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  }

  return env.DB;
}
