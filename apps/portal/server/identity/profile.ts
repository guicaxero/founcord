import type { UpdateProfileInput } from "@ordem/contracts";
import { getD1 } from "@/server/shared/db";
import type { AuthenticatedSession } from "./session";

export type Profile = Readonly<{ portalName: string | null; discordName: string | null }>;

export async function getProfile(userId: string): Promise<Profile | null> {
  const row = await getD1()
    .prepare("SELECT portal_name, discord_name FROM iam_users WHERE id = ?")
    .bind(userId)
    .first<{ portal_name: string | null; discord_name: string | null }>();
  return row ? { portalName: row.portal_name, discordName: row.discord_name } : null;
}

/**
 * Nome no portal. O `display_name`, usado em todas as telas, passa a ser o
 * nome escolhido; vazio, volta ao último nome vindo do Discord.
 */
export async function updateProfile(session: AuthenticatedSession, input: UpdateProfileInput): Promise<Profile> {
  await getD1()
    .prepare(
      `UPDATE iam_users SET
         portal_name = ?,
         -- Contas antigas podem não ter o nome do Discord guardado: o atual é ele.
         discord_name = COALESCE(discord_name, display_name),
         display_name = COALESCE(?, discord_name, display_name),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(input.portalName, input.portalName, session.user.id)
    .run();
  return (await getProfile(session.user.id)) ?? { portalName: input.portalName, discordName: null };
}
