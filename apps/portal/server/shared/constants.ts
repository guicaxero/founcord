export const DEFAULT_CAMPAIGN_ID = "11111111-1111-4111-8111-111111111111";
export const SYSTEM_USER_ID = "00000000-0000-4000-8000-000000000000";

export const SESSION_COOKIE = "ordem_session";
export const OAUTH_COOKIE = "ordem_oauth";
/**
 * Nomes usados antes da renomeação do portal. Continuam sendo lidos por uma
 * versão, para que ninguém seja desconectado no deploy; podem sair depois.
 */
export const LEGACY_SESSION_COOKIE = "vigilia_session";
export const LEGACY_OAUTH_COOKIE = "vigilia_oauth";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;
export const OAUTH_TTL_SECONDS = 60 * 10;
