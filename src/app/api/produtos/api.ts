import { NextRequest, NextResponse } from "next/server";

import { ProductValidationError } from "@/lib/products";
import { requireVerifiedSession } from "@/lib/server/auth";
import { ProductServiceError } from "@/lib/server/products";

const MAX_BODY_BYTES = 32_768;

export function noStoreResponse(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export function unavailableResponse(): NextResponse {
  return noStoreResponse(
    {
      error: "Contas indisponíveis neste ambiente.",
      code: "AUTH_DISABLED",
    },
    503,
  );
}

export function authIsEnabled(): boolean {
  return process.env.AUTH_ENABLED === "true";
}

export async function getVerifiedUserId(
  request: NextRequest,
): Promise<string | null> {
  const session = await requireVerifiedSession(request.headers);

  return session?.user.id ?? null;
}

export function hasTrustedOrigin(request: NextRequest): boolean {
  const configuredUrl =
    process.env.BETTER_AUTH_URL ?? process.env.AUTH_BASE_URL;

  if (!configuredUrl) {
    return false;
  }

  try {
    return request.headers.get("origin") === new URL(configuredUrl).origin;
  } catch {
    return false;
  }
}

export async function readProductBody(
  request: NextRequest,
): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);

  if (contentLength > MAX_BODY_BYTES) {
    throw new ProductValidationError("A solicitação excede o tamanho permitido.");
  }

  const raw = await request.text();

  if (raw.length > MAX_BODY_BYTES) {
    throw new ProductValidationError("A solicitação excede o tamanho permitido.");
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new ProductValidationError("Produto inválido.");
  }
}

export function productErrorResponse(error: unknown): NextResponse {
  if (error instanceof ProductValidationError) {
    return noStoreResponse({ error: error.message, code: error.code }, 422);
  }

  if (error instanceof ProductServiceError) {
    const status =
      error.code === "PRODUCT_NOT_FOUND"
        ? 404
        : error.code === "PRODUCT_READ_ONLY"
          ? 403
          : 409;

    return noStoreResponse({ error: error.message, code: error.code }, status);
  }

  return noStoreResponse(
    {
      error: "Não foi possível concluir a operação com produtos. Tente novamente.",
      code: "PRODUCTS_UNAVAILABLE",
    },
    503,
  );
}
