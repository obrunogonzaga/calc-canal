import { NextRequest } from "next/server";

import { createBatchRepricePreview } from "@/lib/server/batch-reprice";

import {
  authIsEnabled,
  getVerifiedUserId,
  hasTrustedOrigin,
  noStoreResponse,
  readProductBody,
  unavailableResponse,
} from "../../api";
import { batchRepriceErrorResponse } from "../api";

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

    const preview = await createBatchRepricePreview(
      userId,
      await readProductBody(request),
    );

    return noStoreResponse(preview);
  } catch (error) {
    return batchRepriceErrorResponse(error);
  }
}
