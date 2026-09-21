import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// unit: testes puros, colocados ao lado do código em src/ e server/.
// integration: testes Miniflare em */tests/, que exigem `bun run build && bun run bundle`.
export default defineConfig({
  test: {
    environment: "node",
    projects: [
      {
        resolve: {
          // Mesmo alias "@/" do tsconfig do portal.
          alias: { "@": fileURLToPath(new URL("./apps/portal", import.meta.url)) },
        },
        test: {
          name: "unit",
          include: [
            "packages/*/src/**/*.test.ts",
            "workers/*/src/**/*.test.ts",
            "apps/portal/server/**/*.test.ts",
          ],
        },
      },
      {
        test: {
          name: "integration",
          include: [
            "tests/**/*.test.ts",
            "apps/portal/tests/**/*.test.ts",
            "workers/*/tests/**/*.test.ts",
          ],
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
