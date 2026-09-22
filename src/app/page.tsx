import type { Metadata } from "next";
import Link from "next/link";
import { Calculator } from "@/components/Calculator";
import { getSiteOrigin } from "@/lib/site";

const origin = getSiteOrigin();
export const metadata: Metadata = {
  alternates: origin ? { canonical: origin } : undefined,
};
const faqs = [
  [
    "Posso calcular sem criar conta?",
    "Sim. A calculadora desta prévia é gratuita, sem cadastro e sem limite diário de simulações. O catálogo e o plano PRO ainda estão em preparação.",
  ],
  [
    "Margem é a mesma coisa que markup?",
    "Não. A margem exibida é a contribuição dividida pelo preço de venda. Markup compara o acréscimo com o custo. Para uma margem de 20%, não basta somar 20% ao custo.",
  ],
  [
    "O resultado é meu lucro líquido?",
    "Não. É a contribuição estimada por unidade depois dos custos informados. Despesas fixas, publicidade, devoluções e outros custos não informados ainda precisam ser considerados.",
  ],
  [
    "As taxas já estão preenchidas?",
    "A comissão e o imposto precisam ser informados ou confirmados por você. Uma regra automática só é aplicada dentro do escopo e da vigência descritos na calculadora. Nos demais casos, as taxas são manuais.",
  ],
  [
    "O frete e os impostos estão incluídos?",
    "Apenas os valores que você informar. Use o frete pago por você por unidade e a alíquota aplicável à sua operação. Se optar por não incluir impostos, a simulação indicará essa premissa.",
  ],
  [
    "Já posso assinar ou salvar meus produtos?",
    "Ainda não. Esta prévia permite calcular e baixar a simulação. Cadastro, catálogo, pagamento e cancelamento serão disponibilizados juntos na versão comercial, com condições publicadas antes da contratação.",
  ],
];
export default function Home() {
  return (
    <main id="conteudo">
      <section className="hero shell">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="status-dot" /> Para quem vende em marketplaces
          </p>
          <h1>
            Seu preço pronto.
            <br />
            <span>Sua margem clara.</span>
          </h1>
          <p className="hero-description">
            Antes de anunciar, descubra quanto sobra. Coloque custo, taxas e
            margem na mesma conta — sem abrir uma planilha.
          </p>
          <div className="hero-actions">
            <a className="button primary" href="#calculadora">
              Calcular meu preço <span aria-hidden="true">↗</span>
            </a>
            <a className="text-link" href="#como-funciona">
              Entenda a conta <span aria-hidden="true">↓</span>
            </a>
          </div>
          <p className="hero-note">
            Grátis, sem cadastro. Seus números ficam nesta sessão.
          </p>
        </div>
        <aside className="receipt" aria-label="Exemplo fictício de uma venda">
          <div className="receipt-top">
            <span>Uma venda, por dentro</span>
            <span className="example-tag">Exemplo fictício</span>
          </div>
          <div className="receipt-price">
            <span>Preço de venda</span>
            <strong>
              R$ 100<span>,00</span>
            </strong>
          </div>
          <dl className="receipt-lines">
            <div>
              <dt>Produto + embalagem</dt>
              <dd>R$ 53,00</dd>
            </div>
            <div>
              <dt>Comissão informada · 16%</dt>
              <dd>R$ 16,00</dd>
            </div>
            <div>
              <dt>Imposto informado · 6%</dt>
              <dd>R$ 6,00</dd>
            </div>
            <div>
              <dt>Taxa fixa informada</dt>
              <dd>R$ 6,00</dd>
            </div>
          </dl>
          <div className="receipt-total">
            <span>
              Contribuição estimada<strong>19% da venda</strong>
            </span>
            <strong>R$ 19,00</strong>
          </div>
          <div className="cost-bar" aria-hidden="true">
            <span style={{ width: "53%" }} />
            <span style={{ width: "28%" }} />
            <span style={{ width: "19%" }} />
          </div>
          <p>
            Frete R$ 0 neste exemplo. Valores ilustrativos, sem vínculo com uma
            tarifa oficial.
          </p>
        </aside>
      </section>
      <div className="channel-strip shell">
        <span>Uma conta para o seu canal</span>
        <div>
          <strong>Mercado Livre</strong>
          <strong>Shopee</strong>
          <strong>Amazon</strong>
          <strong>Magalu</strong>
        </div>
        <p>Confira o escopo da regra ou informe suas taxas.</p>
      </div>
      <section
        id="calculadora"
        className="calculator-section shell"
        aria-labelledby="calculator-title"
      >
        <div className="section-intro">
          <div>
            <p className="eyebrow">Calculadora gratuita</p>
            <h2 id="calculator-title">Vamos encontrar seu preço?</h2>
          </div>
          <p>Comece pelo custo ou confira um preço que você já pratica.</p>
        </div>
        <Calculator />
      </section>
      <section id="como-funciona" className="how-section shell">
        <div className="section-intro">
          <h2>
            A conta aberta,
            <br />
            do custo à margem.
          </h2>
          <p>
            O resultado tem que fazer sentido para você. Cada parcela aparece no
            detalhamento.
          </p>
        </div>
        <ol className="steps">
          <li>
            <span>01</span>
            <h3>Informe seus custos</h3>
            <p>
              Produto, embalagem, frete, comissão e imposto. Confirme o que se
              aplica à sua operação.
            </p>
          </li>
          <li>
            <span>02</span>
            <h3>Escolha sua margem</h3>
            <p>
              Veja o preço sugerido ou descubra quanto sobra com o preço de
              venda que você informar.
            </p>
          </li>
          <li>
            <span>03</span>
            <h3>Confira antes de vender</h3>
            <p>
              Revise as premissas e baixe o PDF. A simulação não altera nenhum
              anúncio.
            </p>
          </li>
        </ol>
      </section>
      <section id="planos" className="plans-section">
        <div className="shell">
          <div className="section-intro">
            <div>
              <p className="eyebrow">
                Comece com uma conta. Evolua para o catálogo.
              </p>
              <h2>
                Hoje, calcule grátis.
                <br />
                Depois, poupe trabalho.
              </h2>
            </div>
            <p>
              O PRO está em preparação. Esta página ainda não recebe pagamentos
              nem cadastra contas.
            </p>
          </div>
          <div className="plans">
            <article className="plan">
              <p className="plan-label">Disponível nesta prévia</p>
              <h3>Calculadora grátis</h3>
              <p className="plan-price">R$ 0</p>
              <ul>
                <li>Dois modos de cálculo</li>
                <li>Custos e premissas detalhados</li>
                <li>PDF da simulação</li>
                <li>Sem cadastro e sem limite diário</li>
              </ul>
              <a className="button secondary" href="#calculadora">
                Fazer uma simulação
              </a>
            </article>
            <article className="plan pro-plan">
              <p className="plan-label">Em preparação · oferta proposta</p>
              <h3>PreçoPronto PRO</h3>
              <p className="plan-price">
                R$ 19,90<span>/mês</span>
              </p>
              <ul>
                <li>Até 500 produtos salvos</li>
                <li>Importação e exportação CSV</li>
                <li>Atualização de preços em lote</li>
                <li>Comparação antes e depois do reajuste</li>
              </ul>
              <p className="plan-disclaimer">
                Preço e limites sujeitos à definição final. Não há assinatura
                disponível. O Free com conta prevê até 5 produtos.
              </p>
              <Link href="/ajuda#lancamento" className="text-link">
                O que está sendo preparado <span aria-hidden="true">↗</span>
              </Link>
            </article>
          </div>
        </div>
      </section>
      <section className="faq-section shell" aria-labelledby="faq-title">
        <div>
          <p className="eyebrow">Sem letra miúda na conta</p>
          <h2 id="faq-title">
            Perguntas que
            <br />
            vale fazer.
          </h2>
          <Link className="text-link" href="/ajuda">
            Mais ajuda <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <div>
          {faqs.map(([q, a]) => (
            <details key={q}>
              <summary>
                {q}
                <span aria-hidden="true">+</span>
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}
