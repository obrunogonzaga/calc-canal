import type { Metadata } from "next";
import { getSiteOrigin } from "@/lib/site";
import { InfoPage } from "@/components/InfoPage";
import { supportUrl } from "@/lib/site";

const accountPilot =
  process.env.APP_ENV === "production" && process.env.AUTH_ENABLED === "true";

export const metadata: Metadata = {
  title: accountPilot ? "Privacidade do piloto restrito" : "Privacidade da prévia",
  alternates: getSiteOrigin()
    ? { canonical: getSiteOrigin() + "/privacidade" }
    : undefined,
};
export default function Privacy() {
  if (accountPilot) {
    return (
      <InfoPage title="Privacidade do piloto restrito">
        <p className="notice">
          Esta versão permite apenas contas próprias de teste, atrás de senha e
          convite por e-mail. Use dados fictícios de produtos. O responsável
          pelo teste é Bruno Gonzaga; dúvidas e pedidos sobre dados podem ser
          enviados a <a href={supportUrl}>bruno@aifbr.com.br</a>.
        </p>
        <h2>Dados usados</h2>
        <p>
          Para criar a conta, tratamos nome, e-mail, senha protegida por hash,
          sessões e registro do aceite. Simulações e produtos que você salvar
          ficam ligados à sua conta. O cálculo avulso acontece no navegador;
          não enviamos dados ao marketplace.
        </p>
        <h2>Onde ficam e quem envia e-mails</h2>
        <p>
          A aplicação e o banco isolado ficam no VPS da Hostinger. O Resend
          envia os links necessários para confirmar o e-mail e recuperar a
          senha. Não ativamos e-mails de marketing neste piloto. Cópias locais
          do banco servem à recuperação; elas ainda não têm cópia externa.
        </p>
        <h2>Acesso e exclusão</h2>
        <p>
          A conta autenticada pode baixar uma cópia em JSON de seus dados nas
          Configurações, inclusive no Free. O pedido de exclusão exige confirmação
          e gera protocolo. Antes do pedido, a renovação do cartão precisa estar
          confirmadamente cancelada e não pode haver checkout aberto. O pedido
          fica em análise; não apaga dados imediatamente. Prazos de retenção,
          eliminação e tratamento das cópias de segurança ainda dependem de
          definição fiscal e jurídica antes da abertura comercial.
        </p>
      </InfoPage>
    );
  }

  return (
    <InfoPage title="Privacidade desta prévia">
      <p className="notice">
        Versão 2026-09-22. Prévia de desenvolvimento; nos testes locais, use
        apenas dados fictícios. Identificação do fornecedor, canal privado para
        solicitações e política comercial definitiva precisam ser publicados
        antes do lançamento público de contas.
      </p>
      <h2>Calculadora e rascunho</h2>
      <p>
        O cálculo avulso acontece no navegador. Ao escolher guardar uma
        simulação, o rascunho fica no armazenamento desta aba para continuar
        após o cadastro. Ele é removido ao salvar na conta, descartar, sair ou
        fechar a aba. Não há envio ao marketplace.
      </p>
      <h2>Conta e simulações salvas</h2>
      <p>
        Nos ambientes com cadastro habilitado, guardamos nome, e-mail,
        confirmação do endereço, senha protegida por hash, sessões e registro de
        aceite destas condições. A simulação só é persistida depois de entrar e
        confirmar o salvamento. Os dados são vinculados à conta autenticada.
      </p>
      <p>
        A preferência opcional de novidades é separada dos e-mails de
        verificação e recuperação necessários ao acesso. Nenhuma campanha de
        marketing foi ativada nesta prévia.
      </p>
      <h2>E-mails e testes</h2>
      <p>
        No ambiente local, mensagens de verificação e recuperação são recebidas
        por uma caixa de teste na própria máquina, sem envio para a internet.
        Ela contém links de acesso temporários e não deve ser exposta
        publicamente. Entrega a endereços reais depende da configuração de um
        serviço de e-mail e da aprovação da operação comercial.
      </p>
      <h2>Infraestrutura e PDF</h2>
      <p>
        A hospedagem pode processar dados técnicos necessários à entrega do
        site. Não adicionamos analytics de marketing. O PDF é gerado no
        navegador e contém os valores e premissas exibidos.
      </p>
      <h2>Solicitações e links externos</h2>
      <p>
        Para dúvidas ou solicitações sobre seus dados nesta prévia, escreva para{" "}
        <a href={supportUrl}>bruno@aifbr.com.br</a>. Não envie senhas, tokens ou
        dados de cartão por e-mail. O procedimento completo de exclusão e
        retenção será publicado antes do lançamento público.
      </p>
    </InfoPage>
  );
}
