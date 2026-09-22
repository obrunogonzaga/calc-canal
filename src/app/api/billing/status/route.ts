import { NextRequest } from "next/server";

import { getBillingStatus } from "@/lib/server/billing";

import {
  billingAuthEnabled,
  billingErrorResponse,
  billingResponse,
  billingUserId,
} from "../api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!billingAuthEnabled()) {
    return billingResponse(
      { error: "Contas indisponíveis neste ambiente.", code: "AUTH_DISABLED" },
      503,
    );
  }

  try {
    const userId = await billingUserId(request);

    if (!userId) {
      return billingResponse(
        { error: "Entre novamente para continuar.", code: "UNAUTHENTICATED" },
        401,
      );
    }

    return billingResponse(await getBillingStatus(userId));
  } catch (error) {
    return billingErrorResponse(error);
  }
}
