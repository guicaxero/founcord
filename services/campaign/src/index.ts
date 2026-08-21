import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { MissionListResponseSchema } from "@vigilia/contracts";

const campaignApp = new OpenAPIHono();

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            service: z.literal("campaign"),
            status: z.literal("ok"),
          }),
        },
      },
      description: "Campaign service health",
    },
  },
});

const listMissionsRoute = createRoute({
  method: "get",
  path: "/v1/missions",
  responses: {
    200: {
      content: {
        "application/json": { schema: MissionListResponseSchema },
      },
      description: "Published missions visible to the current campaign",
    },
  },
});

campaignApp.openapi(healthRoute, (context) =>
  context.json({ service: "campaign", status: "ok" }),
);

campaignApp.openapi(listMissionsRoute, (context) =>
  context.json({ data: [], nextCursor: null }),
);

campaignApp.doc("/openapi.json", {
  openapi: "3.1.0",
  info: { title: "Vigília Campaign API", version: "0.1.0" },
});

export default campaignApp;
