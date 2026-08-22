const applicationId =
  process.env.DISCORD_APPLICATION_ID?.trim() || "1540460545558323250";
const botToken = required("DISCORD_BOT_TOKEN");
const guildId = process.env.DISCORD_GUILD_ID?.trim() || "1529124400694300702";
const route = guildId
  ? `/applications/${applicationId}/guilds/${guildId}/commands`
  : `/applications/${applicationId}/commands`;

const response = await fetch(`https://discord.com/api/v10${route}`, {
  method: "PUT",
  headers: {
    authorization: `Bot ${botToken}`,
    "content-type": "application/json",
  },
  body: JSON.stringify([
    {
      name: "post",
      description: "Cria um post da Ordem e envia para revisão no portal.",
      type: 1,
      dm_permission: false,
      options: [
        {
          type: 7,
          name: "forum",
          description: "Fórum onde o post será publicado após a revisão.",
          required: true,
          channel_types: [15],
        },
      ],
    },
  ]),
});

if (!response.ok) {
  const body = await response.text();
  throw new Error(`Discord recusou o registro (${response.status}): ${body.slice(0, 500)}`);
}

const commands = await response.json();
console.log(
  `Comandos registrados com sucesso (${Array.isArray(commands) ? commands.length : 0}) no escopo ${
    guildId ? `guild ${guildId}` : "global"
  }.`,
);

function required(key) {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Defina ${key} no ambiente antes de registrar comandos.`);
  return value;
}
