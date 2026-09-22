import { NextRequest } from "next/server";

import { createCardCheckout, createPixCheckout } from "@/lib/server/billing";

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
    return billingResponse(
      { error: "Contas indisponíveis neste ambiente.", code: "AUTH_DISABLED" },
      503,
    );
  }

  if (!billingTrustedOrigin(request)) {
    return billingResponse({ error: "Origem inválida.", code: "BAD_ORIGIN" }, 403);
  }

  try {
    const userId = await billingUserId(request);

    if (!userId) {
      return billingResponse(
        { error: "Entre novamente para continuar.", code: "UNAUTHENTICATED" },
        401,
      );
    }

    const body = await readBillingBody(request);

    if (
      !body ||
      typeof body !== "object" ||
      ((body as Record<string, unknown>).method !== "card" &&
        (body as Record<string, unknown>).method !== "pix")
    ) {
      return billingResponse(
        { error: "Método de cobrança inválido.", code: "INVALID_METHOD" },
        422,
      );
    }

    const method = (body as Record<string, "card" | "pix">).method;
    const checkout =
      method === "pix"
        ? await createPixCheckout(userId)
        : await createCardCheckout(userId);

    return billingResponse(checkout, checkout.order.status === "creating" ? 202 : 200);
  } catch (error) {
    return billingErrorResponse(error);
  }
}
