import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

const integrationApp = new OpenAPIHono();

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            service: z.literal("integration"),
            status: z.literal("ok"),
          }),
        },
      },
      description: "Integration service health",
    },
  },
});

integrationApp.openapi(healthRoute, (context) =>
  context.json({ service: "integration", status: "ok" }),
);

integrationApp.doc("/openapi.json", {
  openapi: "3.1.0",
  info: { title: "Vigília Integration API", version: "0.1.0" },
});

export default integrationApp;
