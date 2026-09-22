# Milestone 1 — evidências e prontidão

## Escopo

Issues #3, #4, #5 e #6. Branch de implementação: `feat/milestone-1-preco-pronto`.

A entrega de código não conclui decisões do fundador, contas externas, homologação autenticada, registro de domínio, publicação ou cobrança. Não há auth, catálogo nem checkout neste milestone.

## #3 — ficha de decisões

| Item | Proposta | Evidência/estado | Próxima ação |
|---|---|---|---|
| Marca | PreçoPronto | Escolhida na conversa | Aplicada na prévia |
| Mensal | R$ 19,90 | Pendente de decisão do fundador | Confirmar oferta |
| Limites | Free 5 / PRO 500 produtos | Pendente de decisão | Confirmar limites |
| Pagamento | Cartão recorrente e Pix avulso mensal | Escopo do MVP; gateway não selecionado | Confirmar provedor/conta |
| Carência | 3 dias só na renovação | Proposta | Confirmar política |
| Retenção/cancelamento | Fim do período pago; excedentes em leitura; retenção a definir | Proposta, não contrato | Definir prazo e processo |
| Gateway | Asaas como candidato | Taxas da conta, elegibilidade e sandbox não verificados | Fundador indicar conta; validar ticket e recursos |
| Auth e banco | Supabase como candidato | Conta/ambiente não verificados | Definir fornecedor e acesso seguro |
| E-mail | Resend como candidato | Domínio remetente/conta não verificados | Definir remetente e validar entrega |
| Hospedagem | Vercel como candidato | Repositório Next.js; projeto/domínio não verificados nesta entrega | Definir projeto e ambientes |
| Domínio | precopronto.com.br | Proposto; não há prova de aquisição | Confirmar propriedade/DNS |
| Fornecedor/CNPJ e NFS-e | Não informado | Bloqueia contratação pública | Definir com responsável |
| Suporte comercial | E-mail/formulário a definir | Prévia aponta ao GitHub público, sem formulário que perde dados | Informar canal e horário |
| Tarifas | Revisão semanal | Processo abaixo; responsável comercial não designado | Nomear responsável |

Nunca registrar credenciais nessa ficha. Perguntas foram enviadas ao fundador; ausência de resposta não equivale a aprovação. As propostas aparecem explicitamente como propostas na landing. #3 permanece aberta enquanto as decisões/contas não estiverem comprovadas.

## #4 — cálculo e qualidade

- Valores BRL completos, centavos, validação de entradas e taxas; comparação de margem após arredondar encargos.
- Contribuição estimada substitui promessa de lucro líquido. Imposto exige valor ou exclusão explícita.
- Qualquer edição limpa resultado e exportação; PDF usa snapshot de entradas/premissas e versão de regra.
- Sem bloqueio diário, lista de e-mails local ou falso paywall. Biblioteca PDF carregada sob demanda.
- Testes do núcleo, UI e PDF; lint, tipos, cobertura e build no CI. Verificar comandos no README.

## #5 — homologação documental de escopo limitado

Fonte: [Custos por vender — Mercado Livre](https://developers.mercadolivre.com.br/pt_br/comissao-por-vender), atualização exibida 03/09/2026, conferida em 22/09/2026.

A documentação alterou a regra brasileira em 02/03/2026. Para **ME2 Drop Off**, o componente de custo fixo é zero em qualquer preço; o percentual da comissão e o frete não são determinados por essa regra. Estes continuam manuais, com confirmação da logística pelo usuário. Flex e outras configurações ficam manuais.

Versão implementada: `mlb-me2-drop-off-fixed-2026-09-22`. Próxima revisão: 29/09/2026. Após esse limite, cálculo pelo preset é recusado e a interface orienta modo manual. Conferir vigência no momento do cálculo impede reutilizar um preset vencido em aba antiga.

Testes usam valores de R$ 8 até R$ 100 e vizinhanças de limites legados (12,50; 29; 50; 79) para comprovar que o preset não reaplica taxas antigas. **Esses números não são anunciados como as faixas atuais.** O preset é constante e não depende do TH atual. Modo margem→preço é verificado no preço final.

Homologação é documental do componente fixo, não cotação autenticada de uma conta/categoria. A API exige OAuth e não foi integrada. Não divulgar “todas as tarifas automáticas” ou que a simulação reproduz a cobrança total de qualquer vendedor.

### Revisão semanal

1. Responsável lê fonte oficial e mudanças recentes; registra data, condições e evidência.
2. Se mantida, avança a data de conferência/revisão mediante PR com evidência. Se mudou, cria nova versão e testes.
3. Nunca altera regra antiga associada a uma simulação; nesta prévia, o snapshot e PDF preservam a referência usada.
4. Fonte inconclusiva/configuração desconhecida: desabilitar preset e usar modo manual, sem inventar valores.
5. Validar casos de regressão, antes/no/depois de qualquer fronteira nova e mensagens na UI.

## #6 — landing e superfícies públicas

Landing com CTA para cálculo, exemplo fictício, oferta em preparação, FAQ e páginas reais de ajuda/privacidade/condições da prévia. Sem cadastro ou pagamento falso. Contato real da prévia é a issue pública do GitHub, com aviso para não enviar dados privados.

`NEXT_PUBLIC_SITE_URL` é configurável apenas para origem HTTPS. Sem configuração, preview é noindex e sitemap vazio; não há alegação de domínio comprado. Com origem configurada, canonical e sitemap usam a mesma base. Isso não substitui propriedade do domínio ou a futura autorização das rotas privadas.

**Gate comercial ainda aberto:** fornecedor, políticas finais, suporte comercial, domínio e oferta dependem de #3. As páginas de prévia dizem explicitamente que não são os documentos de contratação. #6 não deve ser fechada como lançamento público comercial enquanto esse gate estiver aberto.

## QA e publicação

Registro de execução final deve separar teste local, CI da PR, preview, merge e produção. A implementação não autoriza merge/deploy. Screenshots e resultados serão anexados/referenciados na PR e no registro de verificação.

### Execução local em 22/09/2026

- `npm run lint`, `npm run typecheck`, `npm run test:coverage` e `npm run build`: aprovados.
- 49 testes; cobertura dos módulos configurados: 95,98% linhas/statements, 88,50% branches, 100% funções. Páginas estáticas não incluídas na porcentagem.
- Navegador interno: desktop 1365×900 e celular 360×800; no celular a largura do conteúdo foi 360 px, sem overflow horizontal. Conferidos exemplo, BRL agrupado, negativo, troca de modo, prejuízo, preset confirmado, premissas, invalidação, FAQ e link Ajuda.
- Exemplo manual: custo 50, embalagem 3, taxa 6, comissão 16%, imposto 6%, margem alvo 20% → preço R$ 101,73, contribuição R$ 20,35. Regra Drop Off nas mesmas premissas → R$ 91,38 e R$ 18,28.
- Preço informado R$ 10 com custos do exemplo → contribuição -R$ 51,20; aviso de perda exibido.
- PDF real baixado pelo navegador (5.740 bytes) e renderizado para conferência: marca, valores, acentos, margem alvo, data e premissas legíveis. O evento de download da ferramenta expirou, mas o arquivo gravado confirmou a exportação.
- Quatro rotas públicas responderam HTTP 200; links e âncoras internos conferidos; preview sem canonical de produção e com noindex. Robots/sitemap configurados testados separadamente.
- Foco de teclado no link “Pular para o conteúdo” visível; nenhuma ocorrência de erro/warning na aba limpa do build final após a simulação.
- jsPDF atualizado para 4.2.1; Vitest para 3.2.7; override PostCSS em versão corrigida, sem migração de major do Next. `npm audit --omit=dev`: zero vulnerabilidades reportadas. Audit completo ainda aponta três entradas moderadas de desenvolvimento (Vitest/mocker/coverage, GHSA-82fw-gwwq-j7x9); não usar servidor Vitest exposto.
- Sem merge ou deploy executado. Oferta, fornecedor, domínio e contas da #3 continuam pendentes; milestone não concluído.
