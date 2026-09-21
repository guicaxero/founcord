import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./portal/migrations",
  schema: "./portal/schema.ts",
  dialect: "sqlite",
});
