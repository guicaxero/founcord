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
        {
          type: 3,
          name: "tag",
          description: "Tag aplicada ao post; obrigatória quando o fórum exigir.",
          required: false,
          autocomplete: true,
        },
      ],
    },
    {
      name: "mercador",
      description: "Consulta o estoque sincronizado do Mercador da campanha.",
      type: 1,
      dm_permission: false,
      options: [
        {
          type: 3,
          name: "busca",
          description: "Filtra pelo nome ou descrição do item.",
          required: false,
          max_length: 80,
        },
        {
          type: 3,
          name: "disponibilidade",
          description: "Filtra os itens pela quantidade disponível.",
          required: false,
          choices: [
            { name: "Em estoque", value: "available" },
            { name: "Esgotados", value: "sold_out" },
          ],
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
