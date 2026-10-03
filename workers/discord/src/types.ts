import type { DiscordPostPublication, DiscordRegistroMessage } from "@ordem/contracts";

export type IntegrationEnv = Readonly<{
  INTEGRATION_DB: D1Database;
  PORTAL: Fetcher;
  DISCORD_PUBLIC_KEY: string;
  DISCORD_APPLICATION_ID: string;
  DISCORD_BOT_TOKEN: string;
  DISCORD_GUILD_ID: string;
  /** Fórum Registro do Corvo, com um tópico por Corvo. */
  REGISTRO_DO_CORVO_CHANNEL_ID?: string;
  INTEGRATION_SERVICE_TOKEN: string;
  DEFAULT_CAMPAIGN_ID: string;
  SITE_URL: string;
  DISCORD_API_BASE_URL?: string;
}>;

export type PublicationBatch = MessageBatch<DiscordPostPublication | DiscordRegistroMessage>;
