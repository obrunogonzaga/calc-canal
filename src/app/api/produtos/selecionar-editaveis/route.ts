import { NextRequest } from "next/server";

import { selectEditableProducts } from "@/lib/server/products";

import {
  authIsEnabled,
  getVerifiedUserId,
  hasTrustedOrigin,
  noStoreResponse,
  productErrorResponse,
  readProductBody,
  unavailableResponse,
} from "../api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!authIsEnabled()) {
    return unavailableResponse();
  }

  if (!hasTrustedOrigin(request)) {
    return noStoreResponse({ error: "Origem inválida.", code: "BAD_ORIGIN" }, 403);
  }

  try {
    const userId = await getVerifiedUserId(request);

    if (!userId) {
      return noStoreResponse(
        { error: "Entre novamente para continuar.", code: "UNAUTHENTICATED" },
        401,
      );
    }

    const entitlement = await selectEditableProducts(
      userId,
      await readProductBody(request),
    );

    return noStoreResponse({ entitlement });
  } catch (error) {
    return productErrorResponse(error);
  }
}
