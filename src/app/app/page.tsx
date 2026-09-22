import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireVerifiedSession } from "@/lib/server/auth";
import { listSimulations } from "@/lib/server/simulations";
import { formatBRL } from "@/lib/pricing";
import channels from "@/data/channels.json";
import type { ChannelId } from "@/types/channels";
import { DraftBridge } from "@/components/account/DraftBridge";
export default async function AccountHome() {
  const session = await requireVerifiedSession(await headers());
  if (!session) redirect("/entrar");
  const simulations = await listSimulations(session.user.id);
  return (
    <>
      <div className="account-title">
        <p className="eyebrow">Sua conta</p>
        <h1>
          Uma conta clara.
          <br />E um lugar para voltar.
        </h1>
        <p>
          Olá, {session.user.name}. Suas simulações ficam disponíveis só para
          você.
        </p>
      </div>
      <DraftBridge />
      <section>
        <div className="account-section-heading">
          <h2>Simulações salvas</h2>
          <Link className="text-link" href="/app/calculadora">
            Nova simulação ↗
          </Link>
        </div>
        {simulations.length === 0 ? (
          <div className="account-empty">
            <h3>A primeira conta é por sua conta.</h3>
            <p>
              Faça uma simulação e escolha salvar para conferir o resultado
              depois.
            </p>
            <Link className="button primary" href="/app/calculadora">
              Calcular um preço
            </Link>
          </div>
        ) : (
          <ul className="simulation-list">
            {simulations.map((s) => (
              <li key={s.id}>
                <div>
                  <strong>
                    {channels[s.channel as ChannelId]?.label ?? s.channel}
                  </strong>
                  <p>
                    {new Date(s.created_at).toLocaleDateString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                    })}{" "}
                    ·{" "}
                    {s.rule_id === "manual-v1"
                      ? "Taxas manuais"
                      : "ME2 Drop Off"}
                  </p>
                </div>
                <div>
                  <span>Preço sugerido</span>
                  <strong>{formatBRL(s.result.suggestedPrice)}</strong>
                </div>
                <div>
                  <span>Contribuição</span>
                  <strong className={s.result.netProfit < 0 ? "negative" : ""}>
                    {formatBRL(s.result.netProfit)}
                  </strong>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="field-hint">Até 10 simulações nesta prévia.</p>
      </section>
      <section className="account-empty">
        <h2>Organize seus produtos</h2>
        <p>
          Salve custo, taxas e margem de até cinco produtos no Free. Ao mudar o
          custo, revise o preço antes de atualizar seu anúncio.
        </p>
        <Link className="button primary" href="/app/produtos">
          Abrir catálogo
        </Link>
      </section>
    </>
  );
}
