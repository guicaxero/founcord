import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle-integration",
  schema: "./db/integration-schema.ts",
  dialect: "sqlite",
});
