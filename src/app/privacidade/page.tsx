import { getSiteOrigin } from "@/lib/site";
import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";
export const metadata: Metadata = {
  title: "Privacidade da prévia",
  alternates: getSiteOrigin()
    ? { canonical: getSiteOrigin() + "/privacidade" }
    : undefined,
};
export default function Privacy() {
  return (
    <InfoPage title="Privacidade desta prévia">
      <p className="notice">
        Informações sobre a versão gratuita de demonstração. A política da
        operação comercial, incluindo identificação do fornecedor e canal para
        solicitações de dados, ainda depende de definição antes do lançamento.
      </p>
      <h2>Valores da calculadora</h2>
      <p>
        Os valores digitados são processados no navegador. Esta versão não os
        envia a um servidor para salvar produtos, não cadastra usuários e não
        coleta e-mails para uma lista de espera. Recarregar ou fechar a página
        descarta a simulação.
      </p>
      <h2>PDF e acesso ao site</h2>
      <p>
        O PDF é gerado no seu dispositivo e contém os valores e premissas
        exibidos. Ao acessar o site, a infraestrutura de hospedagem pode
        processar dados técnicos necessários à entrega da página, como endereço
        IP e registros de acesso. Não há analytics de marketing adicionado nesta
        versão.
      </p>
      <h2>Links externos</h2>
      <p>
        Fontes oficiais e o contato no GitHub abrem serviços externos, com
        políticas próprias. Nunca inclua informações privadas em uma solicitação
        pública. Links não enviam seus valores de simulação.
      </p>
      <h2>Dados de versões anteriores</h2>
      <p>
        Uma demonstração anterior podia gravar um contador e e-mails somente no
        armazenamento local do navegador. Esta versão não lê nem envia esses
        dados. Você pode removê-los pelas configurações de dados do site no seu
        navegador.
      </p>
    </InfoPage>
  );
}
