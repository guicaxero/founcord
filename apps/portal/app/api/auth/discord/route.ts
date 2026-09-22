import { OAUTH_COOKIE, OAUTH_TTL_SECONDS } from "@/server/shared/constants";
import { getAuthConfig } from "@/server/identity/config";
import { makeCookie } from "@/server/identity/cookies";
import { randomToken, sha256 } from "@/server/identity/crypto";
import { encodeOAuthState } from "@/server/identity/oauth-state";
import { withApiHandler } from "@/server/shared/http";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(async ({ request }) => {
  const config = getAuthConfig(request);
  const requestUrl = new URL(request.url);
  const requestedReturnTo = requestUrl.searchParams.get("returnTo") ?? "/dashboard";
  const returnTo =
    requestedReturnTo.startsWith("/") && !requestedReturnTo.startsWith("//")
      ? requestedReturnTo
      : "/dashboard";
  const state = randomToken(24);
  const verifier = randomToken(48);
  const signedState = await encodeOAuthState(
    { state, verifier, returnTo, issuedAt: Date.now() },
    config.sessionSecret,
  );

  const authorizationUrl = new URL("https://discord.com/oauth2/authorize");
  authorizationUrl.search = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: config.redirectUri,
    scope: "identify",
    state,
    code_challenge: await sha256(verifier),
    code_challenge_method: "S256",
    prompt: "consent",
  }).toString();

  return new Response(null, {
    status: 302,
    headers: {
      location: authorizationUrl.toString(),
      "set-cookie": makeCookie(request, OAUTH_COOKIE, signedState, {
        maxAge: OAUTH_TTL_SECONDS,
        path: "/api/auth/discord/callback",
      }),
      "cache-control": "no-store",
    },
  });
});
