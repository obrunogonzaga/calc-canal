import { NextRequest } from "next/server";

import { ProductValidationError, validateProductVersion } from "@/lib/products";
import { archiveProduct } from "@/lib/server/products";

import {
  authIsEnabled,
  getVerifiedUserId,
  hasTrustedOrigin,
  noStoreResponse,
  productErrorResponse,
  readProductBody,
  unavailableResponse,
} from "../../api";

interface ProductArchiveRouteContext {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: ProductArchiveRouteContext,
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

    if (
      !body ||
      typeof body !== "object" ||
      typeof (body as Record<string, unknown>).archived !== "boolean"
    ) {
      throw new ProductValidationError("Informe se o produto deve ser arquivado.");
    }

    const bodyRecord = body as Record<string, unknown>;
    const { id } = await params;
    const product = await archiveProduct(
      userId,
      id,
      validateProductVersion(bodyRecord.version),
      bodyRecord.archived as boolean,
    );

    return noStoreResponse({ product });
  } catch (error) {
    return productErrorResponse(error);
  }
}
