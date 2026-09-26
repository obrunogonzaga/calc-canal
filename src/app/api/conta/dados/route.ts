import { NextRequest } from "next/server";
import { exportAccountData, AccountDataError } from "@/lib/server/account-data";
import { authIsEnabled, getVerifiedUserId, noStoreResponse, unavailableResponse } from "../../produtos/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!authIsEnabled()) return unavailableResponse();
  try {
    const userId = await getVerifiedUserId(request);
    if (!userId) return noStoreResponse({ error: "Entre novamente para continuar." }, 401);
    const data = await exportAccountData(userId);
    return new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="dados-liquido.json"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AccountDataError && error.code === "ACCOUNT_NOT_FOUND") {
      return noStoreResponse({ error: error.message }, 404);
    }
    return noStoreResponse({ error: "Não foi possível exportar os dados. Tente novamente." }, 503);
  }
}
