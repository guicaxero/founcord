import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./automation/migrations",
  schema: "./automation/schema.ts",
  dialect: "sqlite",
});
