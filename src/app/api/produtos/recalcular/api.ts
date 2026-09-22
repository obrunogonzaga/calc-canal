import { NextResponse } from "next/server";

import { ProductValidationError } from "@/lib/products";
import { BatchRepriceError } from "@/lib/server/batch-reprice";

import { noStoreResponse } from "../api";

export function batchRepriceErrorResponse(error: unknown): NextResponse {
  if (error instanceof ProductValidationError) {
    return noStoreResponse({ error: error.message, code: error.code }, 422);
  }

  if (error instanceof BatchRepriceError) {
    const status =
      error.code === "BATCH_PRO_REQUIRED"
        ? 403
        : error.code === "BATCH_PREVIEW_NOT_FOUND"
          ? 404
          : error.code === "BATCH_PREVIEW_EXPIRED"
            ? 410
            : error.code === "BATCH_CONFIRMATION_BLOCKED"
              ? 422
              : 409;

    return noStoreResponse(
      {
        error: error.message,
        code: error.code,
        ...(error.details ? { details: error.details } : {}),
      },
      status,
    );
  }

  return noStoreResponse(
    {
      error: "Não foi possível recalcular os produtos. Tente novamente.",
      code: "BATCH_REPRICE_UNAVAILABLE",
    },
    503,
  );
}
