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
        "src/lib/products.ts",
        "src/lib/server/products.ts",
        "src/components/catalog/ProductsClient.tsx",
        "src/lib/catalog-csv.ts",
        "src/lib/server/catalog-import.ts",
        "src/components/catalog/ImportCsv.tsx",
        "src/components/catalog/BatchReprice.tsx",
        "src/lib/catalog-export.ts",
        "src/lib/server/batch-reprice.ts",
        "src/components/account/AuthForm.tsx",
        "src/components/account/DraftBridge.tsx",
        "src/components/account/BillingClient.tsx",
        "src/lib/server/asaas-client.ts",
        "src/lib/server/asaas-subscription-client.ts",
        "src/lib/server/billing.ts",
        "src/lib/server/subscription-lifecycle.ts",
        "src/lib/server/billing-reconciliation.ts",
        "src/lib/server/subscription-payment-webhook.ts",
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
