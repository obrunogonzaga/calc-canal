import { getSiteOrigin } from "@/lib/site";
import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";
import { supportUrl } from "@/lib/site";

const accountPilot =
  process.env.APP_ENV === "production" && process.env.AUTH_ENABLED === "true";

export const metadata: Metadata = {
  title: accountPilot ? "Condições do piloto restrito" : "Condições da prévia",
  alternates: getSiteOrigin()
    ? { canonical: getSiteOrigin() + "/termos" }
    : undefined,
};
export default function Terms() {
  if (accountPilot) {
    return (
      <InfoPage title="Condições do piloto restrito">
        <p className="notice">
          O cadastro está disponível somente para e-mails convidados. Nesta
          primeira etapa, usamos apenas contas próprias e dados fictícios. Não há
          contratação, cobrança ou publicação de preços nos marketplaces.
        </p>
        <h2>Simulação e catálogo</h2>
        <p>
          Líquido estima preço e contribuição por unidade com os custos e taxas
          informados. Confira as premissas antes de usar qualquer resultado. O
          catálogo salva produtos para testar importação e recálculo; ele não
          altera anúncios nem se conecta à sua conta de marketplace.
        </p>
        <h2>Dados permitidos no teste</h2>
        <p>
          Use somente produtos e valores fictícios. Não informe dados de
          clientes, cartões, notas fiscais ou credenciais de marketplaces.
          Confira a página de Privacidade antes de criar a conta.
        </p>
        <h2>Ajuda e encerramento</h2>
        <p>
          Para suporte, escreva para{" "}<a href={supportUrl}>bruno@aifbr.com.br</a>.
          Atendimento de segunda a sexta, 9h às 17h (Brasília), com resposta
          em até 24 horas úteis. A cópia dos dados e o pedido de exclusão ficam
          em Configurações. O piloto pode ser interrompido antes de uma oferta
          comercial. As condições finais de reembolso, retenção e documento
          fiscal serão revisadas e publicadas antes de qualquer venda.
        </p>
      </InfoPage>
    );
  }

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
