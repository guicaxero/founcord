import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle-automation",
  schema: "./db/automation-schema.ts",
  dialect: "sqlite",
});
