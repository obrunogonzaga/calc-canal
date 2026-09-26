import { NextRequest } from "next/server";
import { AccountDataError, getDeletionRequest, requestAccountDeletion } from "@/lib/server/account-data";
import { authIsEnabled, getVerifiedUserId, hasTrustedOrigin, noStoreResponse, unavailableResponse } from "../../produtos/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!authIsEnabled()) return unavailableResponse();
  try {
    const userId = await getVerifiedUserId(request);
    if (!userId) return noStoreResponse({ error: "Entre novamente para continuar." }, 401);
    return noStoreResponse({ request: await getDeletionRequest(userId) });
  } catch {
    return noStoreResponse({ error: "Não foi possível consultar a solicitação." }, 503);
  }
}

export async function POST(request: NextRequest) {
  if (!authIsEnabled()) return unavailableResponse();
  if (!hasTrustedOrigin(request)) return noStoreResponse({ error: "Origem inválida." }, 403);
  try {
    const userId = await getVerifiedUserId(request);
    if (!userId) return noStoreResponse({ error: "Entre novamente para continuar." }, 401);
    if (Number(request.headers.get("content-length") ?? 0) > 256) {
      return noStoreResponse({ error: "Confirmação inválida." }, 422);
    }
    const body = await request.text();
    if (body.length > 256 || JSON.parse(body)?.confirmation !== "EXCLUIR") {
      return noStoreResponse({ error: "Digite EXCLUIR para confirmar." }, 422);
    }
    return noStoreResponse({ request: await requestAccountDeletion(userId) }, 202);
  } catch (error) {
    if (error instanceof SyntaxError) return noStoreResponse({ error: "Confirmação inválida." }, 422);
    if (error instanceof AccountDataError) {
      return noStoreResponse({ error: error.message, code: error.code }, error.code === "ACCOUNT_NOT_FOUND" ? 404 : 409);
    }
    return noStoreResponse({ error: "Não foi possível registrar a solicitação. Tente novamente." }, 503);
  }
}
