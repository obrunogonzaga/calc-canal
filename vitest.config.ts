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
    coverage: {
      provider: "v8",
      include: [
        "src/lib/numbers.ts",
        "src/lib/pricing.ts",
        "src/lib/tariffs.ts",
        "src/lib/pdf.ts",
        "src/components/Calculator.tsx",
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
