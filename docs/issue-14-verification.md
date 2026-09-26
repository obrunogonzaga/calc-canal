# Issue #14 — verificação local

Ambiente: worktree `feat/issue-14-support-data`, Next.js local em `localhost:3101`, PostgreSQL descartável em loopback, SMTP de teste em loopback, conta fictícia `@precopronto.test`. Nenhuma cobrança, exclusão de dados reais, envio externo ou deploy foi feito.

## Gates

- `npm run db:migrate`: passou, incluindo `0009_account_data_requests.sql`.
- `npm run lint`: passou.
- `npm run typecheck`: passou.
- `npm run test:coverage`: 263 testes em 31 arquivos, 87,14% de linhas e 74,82% de branches.
- `npm run build`: passou.

## Casos relevantes

- Integração PostgreSQL: exportação Free de conta, simulação e dados próprios; segunda conta não recebe a simulação da primeira.
- Integração PostgreSQL: renovação ativa, cancelamento incerto e checkout aberto impedem pedido de exclusão; cancelamento confirmado permite protocolo estável; outra conta não o vê.
- Integração de cobrança: pedido pendente impede novo checkout de cartão.
- Rotas: sessão ausente nega exportação; origem não confiável e confirmação incorreta negam mutação; identificador enviado pelo cliente não troca o dono.
- Interface: carregamento, erro de solicitação, confirmação digitada, erro de entrega e protocolo de suporte cobertos por testes de componente.

## Navegador

- Conta fictícia criada, e-mail confirmado pela caixa local e login feito no navegador.
- Configurações e Ajuda em 1280 px e 360 px: `documentElement.scrollWidth === innerWidth` nas duas larguras; inspeção visual sem corte dos controles.
- Teclado: após digitar `EXCLUIR`, Tab alcançou o botão e Enter registrou um pedido para a conta fictícia; o protocolo apareceu e a conta permaneceu acessível.
- Exportação JSON autenticada no Free respondeu HTTP 200, `private, no-store`, com conta, simulações, produtos, pedidos e ciclos.
- Formulário em Ajuda retornou protocolo e a caixa SMTP local recebeu uma mensagem de suporte fictícia.

## Limites da evidência

- Não houve entrega externa de e-mail, reembolso, cancelamento ou cobrança em produção.
- Não houve exclusão efetiva: retenção, prazo e operação fiscal/jurídica ainda dependem de decisão.
- O QA de erro de serviço foi feito em testes de rota e componente; a jornada visual de erro de SMTP externo não foi exercida.
