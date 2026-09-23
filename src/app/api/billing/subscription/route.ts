import { NextRequest } from "next/server";

import {
  cancelCardSubscription,
  reconcileCardSubscription,
  recoverPaidCheckout,
  SubscriptionLifecycleError,
  verifyCardCancellation,
} from "@/lib/server/subscription-lifecycle";
import {
  billingAuthEnabled,
  billingErrorResponse,
  billingResponse,
  billingTrustedOrigin,
  billingUserId,
  readBillingBody,
} from "../api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!billingAuthEnabled()) {
    return billingResponse({ error: "Contas indisponíveis neste ambiente.", code: "AUTH_DISABLED" }, 503);
  }
  if (!billingTrustedOrigin(request)) {
    return billingResponse({ error: "Origem inválida.", code: "BAD_ORIGIN" }, 403);
  }
  try {
    const userId = await billingUserId(request);
    if (!userId) {
      return billingResponse({ error: "Entre novamente para continuar.", code: "UNAUTHENTICATED" }, 401);
    }
    const body = await readBillingBody(request);
    const action = body && typeof body === "object" ? (body as Record<string, unknown>).action : undefined;
    if (action === "reconcile") return billingResponse(await reconcileCardSubscription(userId));
    if (action === "recover_checkout") return billingResponse(await recoverPaidCheckout(userId));
    if (action === "cancel") return billingResponse(await cancelCardSubscription(userId));
    if (action === "verify") return billingResponse(await verifyCardCancellation(userId));
    return billingResponse({ error: "Ação inválida.", code: "INVALID_ACTION" }, 422);
  } catch (error) {
    if (error instanceof SubscriptionLifecycleError) {
      const status = error.code === "NO_PAID_CARD_ORDER" ? 404 :
        error.code === "RECONCILIATION_INVALID" ? 422 :
        error.code === "CANCELLATION_PENDING" ? 409 : 503;
      return billingResponse({ error: error.message, code: error.code }, status);
    }
    return billingErrorResponse(error);
  }
}
