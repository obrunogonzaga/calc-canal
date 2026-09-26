import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { requireVerifiedSession } from "@/lib/server/auth";
import { sendSupportRequestEmail } from "@/lib/server/mailer";
import { authIsEnabled, hasTrustedOrigin, noStoreResponse, unavailableResponse } from "../../produtos/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!authIsEnabled()) return unavailableResponse();
  if (!hasTrustedOrigin(request)) return noStoreResponse({ error: "Origem inválida." }, 403);
  try {
    const session = await requireVerifiedSession(request.headers);
    if (!session) return noStoreResponse({ error: "Entre novamente para continuar." }, 401);
    if (Number(request.headers.get("content-length") ?? 0) > 4096) return noStoreResponse({ error: "Mensagem muito longa." }, 422);
    const raw = await request.text();
    if (raw.length > 4096) return noStoreResponse({ error: "Mensagem muito longa." }, 422);
    const body = JSON.parse(raw);
    const category = body?.category;
    const message = body?.message;
    if (!["acesso", "calculo", "csv", "cobranca", "dados", "outro"].includes(category) ||
      typeof message !== "string" || message.trim().length < 10 || message.length > 2000) {
      return noStoreResponse({ error: "Escolha o assunto e escreva de 10 a 2000 caracteres." }, 422);
    }
    const protocol = randomUUID();
    await sendSupportRequestEmail({ protocol, fromEmail: session.user.email, category, message: message.trim() });
    return noStoreResponse({ protocol }, 201);
  } catch (error) {
    if (error instanceof SyntaxError) return noStoreResponse({ error: "Solicitação inválida." }, 422);
    return noStoreResponse({ error: "Não conseguimos enviar a mensagem. Tente novamente ou use o e-mail de suporte." }, 503);
  }
}
