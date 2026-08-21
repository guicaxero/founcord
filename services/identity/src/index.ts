import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

const identityApp = new OpenAPIHono();

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            service: z.literal("identity"),
            status: z.literal("ok"),
          }),
        },
      },
      description: "Identity service health",
    },
  },
});

identityApp.openapi(healthRoute, (context) =>
  context.json({ service: "identity", status: "ok" }),
);

identityApp.doc("/openapi.json", {
  openapi: "3.1.0",
  info: { title: "Vigília Identity API", version: "0.1.0" },
});

export default identityApp;
