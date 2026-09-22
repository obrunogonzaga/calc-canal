import { NextRequest, NextResponse } from "next/server";

import { BillingError } from "@/lib/server/billing";
import { requireVerifiedSession } from "@/lib/server/auth";

const MAX_BILLING_BODY_BYTES = 65_536;

export function billingResponse(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export function billingAuthEnabled(): boolean {
  return process.env.AUTH_ENABLED === "true";
}

export async function billingUserId(
  request: NextRequest,
): Promise<string | null> {
  const session = await requireVerifiedSession(request.headers);

  return session?.user.id ?? null;
}

export function billingTrustedOrigin(request: NextRequest): boolean {
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

export async function readBillingBody(request: NextRequest): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);

  if (contentLength > MAX_BILLING_BODY_BYTES) {
    throw new BillingError("BILLING_WEBHOOK_INVALID", "Solicitação inválida.");
  }

  const raw = await request.text();

  if (new TextEncoder().encode(raw).byteLength > MAX_BILLING_BODY_BYTES) {
    throw new BillingError("BILLING_WEBHOOK_INVALID", "Solicitação inválida.");
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new BillingError("BILLING_WEBHOOK_INVALID", "Solicitação inválida.");
  }
}

export function billingErrorResponse(error: unknown): NextResponse {
  if (error instanceof BillingError) {
    const status =
      error.code === "BILLING_ALREADY_PRO"
        ? 409
        : error.code === "BILLING_CHECKOUT_DISABLED" ||
            error.code === "BILLING_CONFIGURATION_ERROR" ||
            error.code === "BILLING_WEBHOOK_RETRY"
          ? 503
          : error.code === "BILLING_ORDER_NOT_FOUND"
            ? 404
            : error.code === "BILLING_WEBHOOK_INVALID"
              ? 422
              : 409;

    return billingResponse({ error: error.message, code: error.code }, status);
  }

  return billingResponse(
    {
      error: "Não foi possível processar a cobrança. Tente novamente.",
      code: "BILLING_UNAVAILABLE",
    },
    503,
  );
}
