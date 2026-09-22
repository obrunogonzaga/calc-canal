import { NextRequest } from "next/server";

import { validateProductVersion } from "@/lib/products";
import { updateProduct } from "@/lib/server/products";

import {
  authIsEnabled,
  getVerifiedUserId,
  hasTrustedOrigin,
  noStoreResponse,
  productErrorResponse,
  readProductBody,
  unavailableResponse,
} from "../api";

interface ProductRouteContext {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  { params }: ProductRouteContext,
) {
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

    const body = await readProductBody(request);
    const version = validateProductVersion(
      body && typeof body === "object"
        ? (body as Record<string, unknown>).version
        : undefined,
    );
    const { id } = await params;
    const product = await updateProduct(userId, id, version, body);

    return noStoreResponse({ product });
  } catch (error) {
    return productErrorResponse(error);
  }
}
