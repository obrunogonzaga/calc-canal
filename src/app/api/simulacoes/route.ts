import { NextRequest, NextResponse } from "next/server";
import { requireVerifiedSession } from "@/lib/server/auth";
import { listSimulations, saveSimulation } from "@/lib/server/simulations";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
function response(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
export async function GET(request: NextRequest) {
  if (process.env.AUTH_ENABLED !== "true")
    return response({ error: "Contas indisponíveis neste ambiente." }, 503);
  try {
    const session = await requireVerifiedSession(request.headers);
    if (!session)
      return response({ error: "Entre novamente para continuar." }, 401);
    return response({ simulations: await listSimulations(session.user.id) });
  } catch {
    return response(
      { error: "Não foi possível carregar suas simulações. Tente novamente." },
      503,
    );
  }
}
export async function POST(request: NextRequest) {
  if (process.env.AUTH_ENABLED !== "true")
    return response({ error: "Contas indisponíveis neste ambiente." }, 503);
  const trusted = process.env.BETTER_AUTH_URL;
  if (!trusted || request.headers.get("origin") !== new URL(trusted).origin)
    return response({ error: "Origem inválida." }, 403);
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 16_384)
    return response({ error: "Simulação excede o tamanho permitido." }, 413);
  try {
    const session = await requireVerifiedSession(request.headers);
    if (!session)
      return response({ error: "Entre novamente para continuar." }, 401);
    const raw = await request.text();
    if (raw.length > 16_384)
      return response({ error: "Simulação excede o tamanho permitido." }, 413);
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return response({ error: "Simulação inválida." }, 400);
    }
    try {
      return response(
        { simulation: await saveSimulation(session.user.id, data) },
        201,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "PREVIEW_SIMULATION_LIMIT"
      )
        return response(
          {
            error:
              "Você chegou às 10 simulações desta prévia. Seu histórico continua disponível.",
          },
          409,
        );
      if (error instanceof Error && "code" in error)
        return response(
          { error: "Não foi possível salvar. Tente novamente." },
          503,
        );
      return response(
        {
          error: error instanceof Error ? error.message : "Simulação inválida.",
        },
        400,
      );
    }
  } catch {
    return response(
      {
        error:
          "Não foi possível salvar. Sua simulação continua nesta aba; tente novamente.",
      },
      503,
    );
  }
}
