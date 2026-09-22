import { getD1 } from "@/server/shared/db";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const headers = {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  };

  try {
    const result = await getD1()
      .prepare("SELECT 1 AS healthy")
      .first<{ healthy: number }>();
    const healthy = result?.healthy === 1;

    return new Response(
      JSON.stringify({
        service: "portal",
        status: healthy ? "ok" : "degraded",
      }),
      { status: healthy ? 200 : 503, headers },
    );
  } catch {
    return new Response(
      JSON.stringify({ service: "portal", status: "unavailable" }),
      { status: 503, headers },
    );
  }
}
