import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./integration/migrations",
  schema: "./integration/schema.ts",
  dialect: "sqlite",
});
