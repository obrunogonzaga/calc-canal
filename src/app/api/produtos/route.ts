import { NextRequest } from "next/server";

import {
  validateProductListStatus,
  validateProductSearch,
} from "@/lib/products";
import { createProduct, listProducts } from "@/lib/server/products";

import {
  authIsEnabled,
  getVerifiedUserId,
  hasTrustedOrigin,
  noStoreResponse,
  productErrorResponse,
  readProductBody,
  unavailableResponse,
} from "./api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!authIsEnabled()) {
    return unavailableResponse();
  }

  try {
    const userId = await getVerifiedUserId(request);

    if (!userId) {
      return noStoreResponse(
        { error: "Entre novamente para continuar.", code: "UNAUTHENTICATED" },
        401,
      );
    }

    const status = validateProductListStatus(
      request.nextUrl.searchParams.get("status"),
    );
    const search = validateProductSearch(request.nextUrl.searchParams.get("q"));

    return noStoreResponse(await listProducts(userId, { status, search }));
  } catch (error) {
    return productErrorResponse(error);
  }
}

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

    const product = await createProduct(userId, await readProductBody(request));

    return noStoreResponse({ product }, 201);
  } catch (error) {
    return productErrorResponse(error);
  }
}
