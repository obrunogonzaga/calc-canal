# Milestone 1 — evidências e prontidão

Este é o registro histórico do primeiro marco. As decisões comerciais vigentes e o estado atual das integrações estão em [commercial-decisions.md](commercial-decisions.md).

## Escopo

Issues #3, #4, #5 e #6. Branch de implementação: `feat/milestone-1-preco-pronto`.

A entrega de código não conclui decisões do fundador, contas externas, homologação autenticada, registro de domínio, publicação ou cobrança. Não há auth, catálogo nem checkout neste milestone.

## #3 — ficha de decisões

| Item | Proposta | Evidência/estado | Próxima ação |
|---|---|---|---|
| Marca | PreçoPronto | Escolhida na conversa | Aplicada na prévia |
| Mensal | R$ 29,90 | Aprovado pelo fundador em 22/09/2026 | Aplicado à landing; cobrança ainda indisponível |
| Limites | Free 5 / PRO 500 produtos | Aprovados pelo fundador em 22/09/2026 | Aplicar no catálogo do M2 |
| Pagamento | Cartão recorrente e Pix avulso mensal | Escopo do MVP; gateway não selecionado | Confirmar provedor/conta |
| Carência | 3 dias só na renovação | Proposta | Confirmar política |
| Retenção/cancelamento | Fim do período pago; excedentes em leitura; retenção a definir | Proposta, não contrato | Definir prazo e processo |
| Gateway | Asaas selecionado para abertura | Formulário aberto; criação de senha, termos e abertura da conta financeira exigem participação do titular. Conta ainda não criada | Titular concluir cadastro; conferir taxas da conta e homologar |
| Auth e banco | Supabase como candidato | Conta/ambiente não verificados | Definir fornecedor e acesso seguro |
| E-mail | Resend como candidato | Domínio remetente/conta não verificados | Definir remetente e validar entrega |
| Hospedagem | Hostinger VPS para início comercial | Alternativa indicada pelo fundador se Hobby não permitir uso comercial; restrição confirmada na documentação Vercel. VPS consultado em modo leitura com capacidade disponível | Preparar aplicação isolada; domínio e deploy ainda pendentes |
| Domínio | precopronto.com.br | Proposto; não há prova de aquisição | Confirmar propriedade/DNS |
| Fornecedor/CNPJ e NFS-e | Não informado | Bloqueia contratação pública | Definir com responsável |
| Suporte comercial | E-mail/formulário a definir | Prévia aponta ao GitHub público, sem formulário que perde dados | Informar canal e horário |
| Tarifas | Revisão semanal | Processo abaixo; responsável comercial não designado | Nomear responsável |

Nunca registrar credenciais nessa ficha. Perguntas foram enviadas ao fundador; ausência de resposta não equivale a aprovação. Preço e limites foram confirmados; demais propostas não são presumidas aprovadas. A landing continua sem contratação disponível. #3 permanece aberta enquanto as decisões/contas não estiverem comprovadas.

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
- Sem merge ou promoção manual para produção. A integração existente da Vercel criou um preview automático da PR #18; o check está Ready, mas o acesso remoto exige login Vercel. QA funcional realizado no build de produção local. Oferta, fornecedor, domínio e contas comerciais da #3 continuam pendentes; milestone não concluído.

### Conferência complementar

- CI remota do commit c5f9581 aprovada: https://github.com/obrunogonzaga/calc-canal/actions/runs/35773888412.
- Contraste calculado sobre estilos renderizados de 91 elementos de texto da landing (títulos, parágrafos, labels, links, botões, summaries, termos e valores): nenhuma falha; menor razão observada 5,18:1. Essa amostra complementa QA visual e teclado, não é certificação completa de acessibilidade.
- PR #18 continua em rascunho. O código da prévia não resolve as decisões comerciais requeridas pela #3 nem autoriza fechar o milestone.

### Decisões e infraestrutura — atualização do fundador

- Aprovados: R$ 29,90/mês; Free com 5 produtos; PRO com 500.
- Orçamento inicial de aquisição: R$ 200 totais. É limite de teste, não autorização para iniciar campanha; não há CPC, conversão ou retorno observado.
- Hostinger verificada por SSH somente leitura em 22/09/2026 19:46 UTC: 15.992 MB de RAM total, 14.187 MB disponíveis; 156 GB de disco livres; load 0,21/0,21/0,14. Há Docker/Traefik e outros produtos em produção. Não houve alteração, criação de stack ou deploy. A fotografia de capacidade não equivale a teste de carga nem garantia de disponibilidade.
- Regra comercial Vercel: Hobby tem restrições contratuais e cotas técnicas; divulgação de produto/serviço já é exemplo de uso comercial. Não aguardar primeira receita para contratar plano adequado ou mudar de hospedagem. Fonte: https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage.
- Cadastro Asaas em https://www.asaas.com/onboarding/createAccount requer senha e aceite de termos. Formulário deixado para o titular; não houve criação de conta, aceite, envio de CPF/CNPJ/documentos ou geração de credenciais.
- Pendem domínio/fornecedor/suporte, conta elegível do gateway e homologação, escolha de auth/banco/e-mail, retenção e demais políticas.

Novos deploys automáticos via Git na Vercel foram desativados na configuração desta branch, para preparar o início na Hostinger sem continuar publicando a oferta no Hobby. Isso não apaga deploys antigos nem instala a aplicação no VPS. Fonte de configuração: https://vercel.com/docs/project-configuration/git-configuration.
