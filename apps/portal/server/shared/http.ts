import { AuthorizationError } from "@ordem/authz";
import type { ZodType } from "zod";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export type ApiContext = Readonly<{
  request: Request;
  correlationId: string;
}>;

export function jsonResponse(
  data: unknown,
  init: ResponseInit = {},
  correlationId?: string,
): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  if (correlationId) headers.set("x-correlation-id", correlationId);
  return new Response(JSON.stringify(data), { ...init, headers });
}

export async function parseJson<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<T> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new HttpError(
      415,
      "unsupported_media_type",
      "O corpo deve usar application/json.",
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, "invalid_json", "O JSON enviado é inválido.");
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    throw new HttpError(
      422,
      "validation_error",
      "Revise os campos enviados.",
      result.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }
  return result.data;
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const expected = new URL(request.url).origin;

  if (origin && origin !== expected) {
    throw new HttpError(403, "cross_origin_request", "Origem não autorizada.");
  }
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw new HttpError(403, "cross_site_request", "Origem não autorizada.");
  }
}

export function withApiHandler(
  handler: (context: ApiContext) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const suppliedCorrelationId = request.headers.get("x-correlation-id");
    const correlationId =
      suppliedCorrelationId && /^[0-9a-f-]{36}$/i.test(suppliedCorrelationId)
        ? suppliedCorrelationId
        : crypto.randomUUID();

    try {
      return await handler({ request, correlationId });
    } catch (error) {
      const normalized = normalizeError(error);
      if (normalized.status >= 500) {
        console.error(
          JSON.stringify({
            level: "error",
            correlationId,
            code: normalized.code,
            message: error instanceof Error ? error.message : "Unknown error",
          }),
        );
      }
      return jsonResponse(
        {
          error: {
            code: normalized.code,
            message: normalized.message,
            correlationId,
            ...(normalized.fieldErrors
              ? { fieldErrors: normalized.fieldErrors }
              : {}),
          },
        },
        { status: normalized.status },
        correlationId,
      );
    }
  };
}

function normalizeError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  if (error instanceof AuthorizationError) {
    return new HttpError(
      403,
      "forbidden",
      "Você não possui permissão para realizar esta ação.",
    );
  }
  return new HttpError(
    500,
    "internal_error",
    "Não foi possível concluir a operação.",
  );
}
