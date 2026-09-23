import { getSiteOrigin } from "@/lib/site";
import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";
import { supportUrl } from "@/lib/site";
export const metadata: Metadata = {
  title: "Ajuda e contato",
  alternates: getSiteOrigin()
    ? { canonical: getSiteOrigin() + "/ajuda" }
    : undefined,
};
export default function Help() {
  return (
    <InfoPage title="Ajuda para fazer sua conta">
      <h2>Como simular</h2>
      <p>
        Escolha o canal, informe o custo por unidade e os demais encargos. Use
        “Encontrar meu preço” para partir de uma margem desejada ou “Conferir
        minha margem” para avaliar um preço que você já pratica. Aceitamos
        valores como 1.234,56 e 1234,56.
      </p>
      <h2>O que significa contribuição?</h2>
      <p>
        É o valor da venda depois de subtrair os custos informados. Ele ainda
        precisa cobrir despesas fixas, publicidade, devoluções e outros custos
        que você não incluiu. A porcentagem é calculada sobre o preço de venda,
        não sobre o custo.
      </p>
      <h2>Como conferir as taxas</h2>
      <p>
        A comissão, o imposto e o frete dependem da sua operação. Consulte o
        painel do marketplace e, para tributos, o responsável contábil. A regra
        verificada de custo fixo cobre apenas Mercado Livre ME2 Drop Off,
        conforme as condições mostradas. Flex e demais configurações usam modo
        manual.
      </p>
      <h2 id="lancamento">O que está sendo preparado</h2>
      <p>
        Conta, catálogo salvo, importação CSV e recálculo em lote estão em
        homologação nos ambientes de teste habilitados. Ainda não há venda
        pública. O preço mensal definido para o PRO é R$ 29,90; as condições
        finais serão informadas antes de qualquer contratação.
      </p>
      <h2>Contato nesta prévia</h2>
      <p>
        Encontrou um erro ou precisa falar sobre a prévia?{" "}
        <a href={supportUrl}>
          Escreva para bruno@aifbr.com.br
        </a>
        . Não envie senhas, dados de cartão ou documentos por e-mail.
      </p>
      <p>
        O prazo de atendimento e a identificação completa do fornecedor serão
        publicados antes do lançamento pago. Nesta prévia, não há promessa de
        atendimento imediato.
      </p>
      <h2>Um resultado mudou?</h2>
      <p>
        Ao alterar qualquer entrada, o resultado anterior deixa de ser exibido
        para evitar confusão. Calcule novamente antes de baixar outro PDF.
      </p>
    </InfoPage>
  );
}
