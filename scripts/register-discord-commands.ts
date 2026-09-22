/**
 * Registra os comandos de guild do bot a partir da estação local.
 * Uso: bun run discord:register (lê apps/portal/.env.local quando existir).
 * Em produção prefira POST /internal/discord/register-commands no Worker do Discord.
 */
import { guildCommands } from "../workers/discord/src/commands";

const applicationId =
  process.env.DISCORD_APPLICATION_ID?.trim() || "1540460545558323250";
const botToken = required("DISCORD_BOT_TOKEN");
const guildId = process.env.DISCORD_GUILD_ID?.trim() || "1529124400694300702";

const response = await fetch(
  `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`,
  {
    method: "PUT",
    headers: {
      authorization: `Bot ${botToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(guildCommands),
  },
);

if (!response.ok) {
  const body = await response.text();
  throw new Error(`Discord recusou o registro (${response.status}): ${body.slice(0, 500)}`);
}

const commands: unknown = await response.json();
console.log(
  `Comandos registrados com sucesso (${Array.isArray(commands) ? commands.length : 0}) na guild ${guildId}.`,
);

function required(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Defina ${key} no ambiente antes de registrar comandos.`);
  return value;
}
