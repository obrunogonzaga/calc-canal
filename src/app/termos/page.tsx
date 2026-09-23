import { getSiteOrigin } from "@/lib/site";
import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";
export const metadata: Metadata = {
  title: "Condições da prévia",
  alternates: getSiteOrigin()
    ? { canonical: getSiteOrigin() + "/termos" }
    : undefined,
};
export default function Terms() {
  return (
    <InfoPage title="Condições desta prévia">
      <p className="notice">
        Esta página descreve o uso da demonstração gratuita. Não é uma oferta de
        assinatura nem substitui os documentos da operação comercial, que serão
        publicados antes da venda.
      </p>
      <h2>Simulação e premissas</h2>
      <p>
        Líquido estima preço e contribuição por unidade com os valores
        informados. O resultado não é apuração fiscal, garantia de lucro ou
        prova de que todos os custos da sua operação foram considerados. Confira
        as premissas e as tarifas aplicáveis antes de alterar seus anúncios.
      </p>
      <h2>Regras e configuração manual</h2>
      <p>
        Uma regra verificada só vale para a logística e a janela de revisão
        exibidas. Nos demais casos, o usuário informa os valores manualmente.
        Não existe conexão com sua conta do marketplace nesta versão.
      </p>
      <h2>Disponibilidade e pagamentos</h2>
      <p>
        A prévia é gratuita. Não há contratação, renovação, pagamento ou
        catálogo de produtos disponíveis. Nos ambientes de teste habilitados,
        você pode criar conta e guardar simulações. Nenhum clique nesta versão
        gera uma assinatura. O preço de lançamento aprovado para o PRO é R$
        29,90/mês, ainda sem contratação.
      </p>
      <h2>Antes do lançamento comercial</h2>
      <p>
        Serão definidos e publicados: identificação do fornecedor, condições
        finais da oferta, canal de suporte, política de dados, cancelamento,
        reembolso e processo de emissão fiscal. A compra só será disponibilizada
        depois dessas definições e da validação de pagamento.
      </p>
    </InfoPage>
  );
}
