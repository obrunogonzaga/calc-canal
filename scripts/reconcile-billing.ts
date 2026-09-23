import { loadEnvConfig } from "@next/env";

import {
  applyBillingOrderReconciliation,
  inspectBillingOrderReconciliation,
} from "../src/lib/server/billing-reconciliation";
import { closeDbForTests } from "../src/lib/server/db";

loadEnvConfig(process.cwd());

async function main(): Promise<void> {
  const argumentsProvided = process.argv.slice(2);
  const orderArgument = argumentsProvided.find((argument) => argument.startsWith("--order-id="));
  const orderId = orderArgument?.slice("--order-id=".length);
  if (!orderId || argumentsProvided.some((argument) =>
    argument !== orderArgument && argument !== "--apply")) {
    throw new Error("Use --order-id=<UUID> e, para confirmar, --apply.");
  }
  const preview = await inspectBillingOrderReconciliation(orderId);
  const counts = Object.fromEntries([...new Set(preview.candidates.map((item) => item.event))]
    .map((event) => [event, preview.candidates.filter((item) => item.event === event).length]));
  console.log(JSON.stringify({ method: preview.order.method, events: counts, skipped: preview.skipped,
    mode: argumentsProvided.includes("--apply") ? "apply" : "preview" }));
  if (argumentsProvided.includes("--apply")) {
    console.log(JSON.stringify(await applyBillingOrderReconciliation(preview)));
  }
}

void main().catch(() => {
  console.error("Conciliação falhou; confira o pedido e o estado financeiro no Asaas Sandbox.");
  process.exitCode = 1;
}).finally(() => closeDbForTests());
