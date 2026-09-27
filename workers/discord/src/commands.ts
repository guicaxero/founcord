import {
  CHARACTER_COMMAND_NAME,
  MERCHANT_COMMAND_NAME,
  POST_COMMAND_NAME,
} from "./discord-components";

/** Definição única dos comandos de guild registrados pelo Worker e pelo script local. */
export const guildCommands = [
  {
    name: POST_COMMAND_NAME,
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
    name: MERCHANT_COMMAND_NAME,
    description: "Consulta o estoque sincronizado do Lojista da campanha.",
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
  {
    name: CHARACTER_COMMAND_NAME,
    description: "Abre sua ficha vinculada à campanha no portal da Ordem.",
    type: 1,
    dm_permission: false,
  },
] as const;
