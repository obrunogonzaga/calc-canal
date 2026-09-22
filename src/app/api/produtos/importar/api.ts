import { NextRequest, NextResponse } from "next/server";

import { ProductValidationError } from "@/lib/products";
import { CatalogImportError } from "@/lib/server/catalog-import";

import { noStoreResponse } from "../api";

// JSON escaping can expand a valid 2 MB CSV before the parser applies its
// decoded-file limit. The parser remains the authoritative CSV size gate.
const MAX_IMPORT_REQUEST_BYTES = 4_500_000;

export async function readImportBody(request: NextRequest): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);

  if (contentLength > MAX_IMPORT_REQUEST_BYTES) {
    throw new ProductValidationError("O arquivo CSV excede o tamanho permitido.");
  }

  const raw = await request.text();

  if (new TextEncoder().encode(raw).byteLength > MAX_IMPORT_REQUEST_BYTES) {
    throw new ProductValidationError("O arquivo CSV excede o tamanho permitido.");
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new ProductValidationError("Importação inválida.");
  }
}

export function catalogImportErrorResponse(error: unknown): NextResponse {
  if (error instanceof ProductValidationError) {
    return noStoreResponse({ error: error.message, code: error.code }, 422);
  }

  if (error instanceof CatalogImportError) {
    const status =
      error.code === "IMPORT_PRO_REQUIRED"
        ? 403
        : error.code === "IMPORT_PREVIEW_NOT_FOUND"
          ? 404
          : error.code === "IMPORT_PREVIEW_EXPIRED"
            ? 410
            : error.code === "IMPORT_CONFIRMATION_BLOCKED"
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
      error: "Não foi possível processar a importação. Tente novamente.",
      code: "CATALOG_IMPORT_UNAVAILABLE",
    },
    503,
  );
}
