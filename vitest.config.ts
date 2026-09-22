import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: [
        "src/lib/numbers.ts",
        "src/lib/pricing.ts",
        "src/lib/tariffs.ts",
        "src/lib/pdf.ts",
        "src/components/Calculator.tsx",
        "src/lib/simulation-draft.ts",
        "src/lib/server/auth.ts",
        "src/lib/server/db.ts",
        "src/lib/server/mailer.ts",
        "src/lib/server/account-consent.ts",
        "src/lib/server/simulations.ts",
        "src/components/account/AuthForm.tsx",
        "src/components/account/DraftBridge.tsx",
      ],
      reporter: ["text", "json", "html"],
      thresholds: {
        branches: 70,
        functions: 70,
        lines: 70,
        statements: 70,
      },
    },
  },
});
