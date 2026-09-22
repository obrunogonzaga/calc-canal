# Cadastro e área logada — issue #7

## Entrega

Cadastro por e-mail/senha, confirmação do endereço, login, recuperação, logout e área privada. A simulação avulsa pode ser levada por `sessionStorage` até o cadastro; após verificar o e-mail e entrar, o usuário confirma o salvamento. O servidor recalcula os valores e determina a conta proprietária, sem confiar em totais ou IDs enviados pelo navegador.

Esta é uma PR encadeada sobre a branch da PR #18, ainda não integrada à main. Catálogo de produtos, CSV e cobrança continuam nas issues seguintes. A conta da prévia permite até 10 simulações; isso não altera os limites de produtos Free 5 / PRO 500 aprovados.

## Escolhas técnicas para o início na Hostinger

- PostgreSQL separado para o PreçoPronto; nenhuma alteração nos bancos existentes do VPS.
- Better Auth 1.7.5 com sessões persistidas, senha protegida, e-mail obrigatório e consentimentos versionados no servidor.
- SMTP configurável; produção requer TLS e credenciais. Provedor/remetente de produção ainda pendentes. Não é necessário contratar Supabase para o banco/auth desta implementação.
- `AUTH_ENABLED=false` por padrão: API retorna 404 e telas explicam indisponibilidade. Habilitar apenas após configurar dependências. Build com contas habilitadas precisa dessa flag; não é uma chave de mudança de plano comercial.
- `BETTER_AUTH_URL` HTTP só permitido em loopback com `APP_ENV=local`; fora disso, usar HTTPS e origem explícita.
- Sem proxy confiável configurado, o limitador usa um bucket compartilhado (proteção comprovada com 429). Antes do deploy público, configurar somente proxies estreitos/verificados e bloquear acesso direto à origem.

## Ambiente de desenvolvimento

Copie `.env.example` para `.env.local`, gere segredo próprio e configure dois bancos separados: `precopronto_local` e `precopronto_integration`. Nunca use banco de produção nos testes; a integração rejeita host externo e nome de banco diferente do dedicado.

```sh
npm ci
npm run db:migrate
# Em outro terminal; não envia e-mails para a internet:
APP_ENV=local npm run mailbox
# Aplicação:
npm run dev -- --hostname 127.0.0.1 --port 3101
```

Caixa de teste: http://127.0.0.1:18025. Ela aceita somente destinatários `@precopronto.test`; mensagens e links ficam em memória. Não disponibilizar essa ferramenta pela internet. Detalhes em [local-mailbox.md](local-mailbox.md).

Antes da suíte de integração, migrar o banco de testes:

```sh
npx tsx scripts/migrate-auth.ts --test
npm run test:coverage
npm run typecheck
npm run lint
npm run build
```

A integração de simulações prepara sua tabela exclusivamente no banco de teste. `npm run db:migrate` prepara todas as tabelas do ambiente normal. CI usa Postgres 18 descartável e SMTP local, com segredo gerado por execução; credenciais publicadas no workflow servem somente ao serviço descartável de teste.

## Segurança e recuperação

- Verificação de e-mail tem registro adicional de uso único com hash e consumo atômico; URL normalizada, replay e expiração testados.
- Recuperação de senha expira em uma hora; token usado não funciona outra vez, sessões anteriores são revogadas.
- Endpoints de conta verificam sessão e propriedade no servidor; cookie existente sozinho não autoriza acesso.
- Salvamento exige origem correspondente à configuração, valida tamanho/formato, recalcula resultados, deduplica por conta e serializa gravações para respeitar quota mesmo em abas concorrentes.
- Preferência de marketing é opcional e separada do aceite obrigatório; versões dos documentos não são aceitas do cliente.
- Falha SMTP/DB retorna erro sanitizado; cadastro sem e-mail entregue não é anunciado como validado. Reenvio de confirmação permite recuperar cadastro pendente.
- Logout remove o rascunho da aba e faz navegação completa; retornos de BFCache revalidam sessão. Tokens em links de verificação/recuperação não devem aparecer nos logs do proxy. Logs desses caminhos foram desativados no desenvolvimento Next.
- Registro de dados locais de teste não constitui aceite de clientes reais ou política comercial aprovada. Antes de abrir contas publicamente, finalizar fornecedor, canal privado de dados/suporte, retenção, termos e remetente real.

## Verificação executada

- 90 testes aprovados; cobertura global dos módulos medidos: 91,77% linhas e 79,31% branches. Backend server: 88,46% linhas; seu recorte de branches é 63,88%, sem alegação de cobertura uniforme por módulo.
- Integração real Postgres + SMTP: cadastro, consentimentos, entrega à caixa, confirmação, replay, login, reset, revogação, logout, 429 e erro SMTP 503.
- Banco real: dois proprietários isolados, totais/owner forjados ignorados, requisições duplicadas sem duplicar registro e concorrência limitada a 10 simulações.
- Navegador: cálculo fictício → cadastro → SMTP → verificação → login → rascunho recuperado → salvamento → reload → logout → rota privada redirecionada → recuperação → nova senha → login preservando histórico.
- Build Next de produção aprovado; dependências de produção sem achados em `npm audit --omit=dev` nesta execução.
- Aviso conhecido do Better Auth: schema checker descreve `rateLimit.lastRequest` (BIGINT/int8) como tipo inesperado apesar de gerado por seu próprio migrador; o limitador foi exercitado com sucesso. Não foi desabilitada a validação do schema.
- QA desktop executado. Para 360 px, o controle de viewport do navegador não aplicou o tamanho solicitado; foi usado um harness local com iframe de 360×800. Dentro do documento real, `innerWidth=360` e `scrollWidth=360`; não houve overflow. Isso testa layout/media queries, não emulação de toque/dispositivo físico.

## Não entregue como produção

E-mail externo, deploy Hostinger, domínio, backup/restauração desse novo banco, liberação Asaas, chaves de pagamento, webhooks e cobranças reais não foram realizados. A infraestrutura local não é serviço de produção e não configura autorização para publicar.
