export const POST_COMMAND_NAME = "post";
export const POST_MODAL_PREFIX = "post:create:v2:";
const LEGACY_POST_MODAL_PREFIX = "post:create:v1:";

export type DiscordPostModalTarget = Readonly<{
  forumChannelId: string;
  forumTagId: string | null;
}>;

export function postModalResponse(
  forumChannelId: string,
  forumTagId: string | null,
) {
  return {
    type: 9,
    data: {
      custom_id: `${POST_MODAL_PREFIX}${forumChannelId}:${forumTagId ?? "none"}`,
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
              placeholder: "Escreva a mensagem que aparecerá no fórum.",
              style: 2,
              required: true,
              min_length: 1,
              max_length: 1_700,
            },
          ],
        },
      ],
    },
  } as const;
}

export function postTargetFromModal(
  customId: string | undefined,
): DiscordPostModalTarget | null {
  if (customId?.startsWith(LEGACY_POST_MODAL_PREFIX)) {
    const forumChannelId = customId.slice(LEGACY_POST_MODAL_PREFIX.length);
    return isSnowflake(forumChannelId)
      ? { forumChannelId, forumTagId: null }
      : null;
  }
  if (!customId?.startsWith(POST_MODAL_PREFIX)) return null;
  const [forumChannelId, forumTagId, ...extra] = customId
    .slice(POST_MODAL_PREFIX.length)
    .split(":");
  if (extra.length > 0 || !forumChannelId || !isSnowflake(forumChannelId)) {
    return null;
  }
  if (!forumTagId || (forumTagId !== "none" && !isSnowflake(forumTagId))) {
    return null;
  }
  return {
    forumChannelId,
    forumTagId: forumTagId === "none" ? null : forumTagId,
  };
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

function isSnowflake(value: string): boolean {
  return /^\d{6,32}$/.test(value);
}
