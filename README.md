# PreçoPronto

Calculadora gratuita de preço e contribuição por unidade para vendedores de marketplaces. O MVP inclui cadastro, simulações salvas, catálogo e cobrança de teste no Asaas Sandbox. A operação comercial real ainda depende de domínio, hospedagem, políticas e credenciais de produção.

## Desenvolvimento

```sh
npm ci
npm run dev
```

Requer Node.js 22 (mesma versão usada no CI). Abra http://localhost:3000.

## Verificação

```sh
npm run lint
npm run typecheck
npm run test:coverage
npm run build
npm start
```

Vitest testa cálculo, parsing, tarifas, PDF, cadastro, catálogo, cobrança e persistência isolada. A integração exige PostgreSQL e SMTP de teste configurados (veja os guias abaixo). A cobertura destes módulos é exigida em pelo menos 70% de linhas, branches, funções e statements; páginas estáticas não entram nessa métrica. CI executa os mesmos gates. QA visual deve cobrir 360 px e desktop.

## Como calcular

- Informe comissão e imposto aplicáveis à sua operação ou confirme simulação sem impostos.
- Modo custo + margem encontra o menor preço em centavos que atende à margem após arredondar comissão e imposto.
- Modo preço informado mostra a contribuição, inclusive negativa.
- Margem é contribuição dividida pelo preço de venda, não markup. Despesas não informadas não fazem parte do resultado.
- Formatos aceitos incluem `1.234,56`, `1234,56`, inteiros e `1234.56`. `1.234` sozinho é rejeitado por ambiguidade; use `1.234,00` ou `1234`.
- Valores monetários usam centavos; entradas inválidas, negativas ou não finitas são rejeitadas. Combinações de taxas inviáveis produzem erro, não preço fictício.
- Editar entradas invalida o resultado e PDF. O PDF preserva premissas e versão de regra da simulação.

## Tarifas

O padrão é **manual**, sem presets ilustrativos disfarçados de taxas reais. Há uma regra documental limitada para o custo fixo do Mercado Livre ME2 Drop Off, com confirmação explícita da logística. Comissão/frete continuam manuais. Regra expirada pede nova conferência ou modo manual.

Ver [escopo, fonte e revisão de tarifas](docs/milestone-1.md). Essa entrega não usa token de marketplace nem reproduz cotação autenticada.

## Domínio e preview

Copie `.env.example` e configure `NEXT_PUBLIC_SITE_URL` somente após confirmar o domínio de produção. Sem origem configurada, o site usa noindex, não anuncia canonical de produção e retorna sitemap vazio. As páginas informativas são da prévia; fornecedor e políticas comerciais finais estão pendentes.

## Planejamento

- [Milestone 1](https://github.com/obrunogonzaga/calc-canal/milestone/1)
- [MVP e PRD no GitHub](https://github.com/obrunogonzaga/calc-canal/issues/2)
- [Ficha de decisões e limites desta entrega](docs/milestone-1.md)

Não marcar a prontidão de produção como concluída por um build ou por testes com mocks. Ver [homologação Asaas](docs/asaas-sandbox.md) antes de habilitar o checkout de teste.

### Hospedagem comercial inicial

O fundador indicou o VPS Hostinger caso o Hobby não permita a operação comercial. A restrição foi confirmada; `vercel.json` desativa novos deploys automáticos via Git. Deploys existentes não são removidos por essa opção. O servidor foi apenas inspecionado: publicação no VPS, domínio, TLS e backup da nova aplicação continuam pendentes.

## Cadastro em ambiente de testes

O onboarding usa PostgreSQL + Better Auth e uma caixa SMTP local. Veja [configuração e evidências](docs/account-onboarding.md) e [caixa de teste](docs/local-mailbox.md). `AUTH_ENABLED=false` mantém cadastro/API fechados por padrão. Nenhuma configuração de pagamento real foi adicionada.
