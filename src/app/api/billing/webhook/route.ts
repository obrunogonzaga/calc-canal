import { NextRequest } from "next/server";

import {
  isSandboxCheckoutEnabled,
  processAsaasCheckoutWebhook,
  verifyAsaasWebhookToken,
} from "@/lib/server/billing";

import {
  billingErrorResponse,
  billingResponse,
  readBillingBody,
} from "../api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isSandboxCheckoutEnabled()) {
    return billingResponse(
      { error: "Webhook Sandbox indisponível.", code: "WEBHOOK_DISABLED" },
      503,
    );
  }

  try {
    if (!verifyAsaasWebhookToken(request.headers.get("asaas-access-token"))) {
      return billingResponse({ error: "Não autorizado." }, 401);
    }

    const result = await processAsaasCheckoutWebhook(
      await readBillingBody(request),
    );

    return billingResponse({ received: true, ...result });
  } catch (error) {
    return billingErrorResponse(error);
  }
}
