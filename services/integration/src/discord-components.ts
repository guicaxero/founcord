export const POST_COMMAND_NAME = "post";
export const POST_MODAL_PREFIX = "post:create:v1:";

export function postModalResponse(forumChannelId: string) {
  return {
    type: 9,
    data: {
      custom_id: `${POST_MODAL_PREFIX}${forumChannelId}`,
      title: "Novo post da Ordem",
      components: [
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: "post_persona",
              label: "Quem está escrevendo?",
              placeholder: "Personagem, NPC ou narrador",
              style: 1,
              required: false,
              max_length: 80,
            },
          ],
        },
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: "post_title",
              label: "Título",
              style: 1,
              required: true,
              min_length: 3,
              max_length: 100,
            },
          ],
        },
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: "post_body",
              label: "Conteúdo",
              placeholder: "Escreva o contexto ou a mensagem completa.",
              style: 2,
              required: true,
              min_length: 1,
              max_length: 4_000,
            },
          ],
        },
      ],
    },
  } as const;
}

export function forumChannelIdFromModal(customId: string | undefined): string | null {
  if (!customId?.startsWith(POST_MODAL_PREFIX)) return null;
  const forumChannelId = customId.slice(POST_MODAL_PREFIX.length);
  return /^\d{6,32}$/.test(forumChannelId) ? forumChannelId : null;
}

export function extractModalValues(components: unknown): Readonly<Record<string, string>> {
  const values: Record<string, string> = {};
  visitComponents(components, values);
  return values;
}

function visitComponents(value: unknown, values: Record<string, string>): void {
  if (!Array.isArray(value)) return;
  for (const component of value) {
    if (!component || typeof component !== "object") continue;
    const record = component as Record<string, unknown>;
    if (typeof record.custom_id === "string" && typeof record.value === "string") {
      values[record.custom_id] = record.value;
    }
    visitComponents(record.components, values);
  }
}
