import { NextRequest } from "next/server";

import { createCatalogImportPreview } from "@/lib/server/catalog-import";

import {
  authIsEnabled,
  getVerifiedUserId,
  hasTrustedOrigin,
  noStoreResponse,
  unavailableResponse,
} from "../../api";
import { catalogImportErrorResponse, readImportBody } from "../api";

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

    const preview = await createCatalogImportPreview(
      userId,
      await readImportBody(request),
    );

    return noStoreResponse(preview);
  } catch (error) {
    return catalogImportErrorResponse(error);
  }
}
