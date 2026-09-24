# Publicação restrita do Líquido

Destino planejado: `piloto.useliquido.com.br`, na stack isolada `liquido-pilot` do VPS Hostinger. Esta primeira etapa publica somente a calculadora e as páginas informativas, protegidas por senha. `AUTH_ENABLED=false` e `BILLING_SANDBOX_ENABLED=false` impedem cadastro e checkout; `APP_ENV=production` também impede o checkout Sandbox. Sem `NEXT_PUBLIC_SITE_URL`, a aplicação gera `noindex` e sitemap vazio. O proxy acrescenta `X-Robots-Tag: noindex, nofollow`.

## Antes de aplicar

1. Revisar e integrar o commit escolhido. Construir e conferir a imagem desse SHA; o tag em `.env` deve ser o SHA revisado.
2. Criar `A` para `piloto.useliquido.com.br` apontando para `82.112.245.152`, sem alterar os domínios principais. Confirmar resolução pública antes de solicitar TLS.
3. Criar uma senha longa fora do repositório e gerar o par `usuario:hash` com `htpasswd -nbB`. Guardar o hash em `deploy/pilot/.env` apenas no servidor. Não enviar a senha pelo chat.
4. Confirmar que a rede Docker externa `proxy` e o resolver TLS `letsencrypt` seguem ativos. A stack nova não altera a configuração do Traefik nem de outras aplicações.
5. Confirmar com o fundador o escopo, a ação no VPS e o impacto esperado antes de qualquer alteração remota.

## Publicação e leitura de volta

Copiar o checkout exato do SHA revisado para uma pasta própria da stack. Na pasta `deploy/pilot`, validar `docker compose config` sem publicar o resultado, executar `docker compose build web` e `docker compose up -d web`. Verificar `docker compose ps`, o healthcheck e os últimos logs, sem expor segredos. Conferir que HTTPS pede senha, que após autenticação a calculadora abre, que `robots` indica `noindex` e que cadastro e checkout estão indisponíveis. Testar desktop, 360 px, teclado e erros. Guardar o SHA publicado e a evidência de retorno. Um build local ou CI verde não comprova publicação.

## Próxima etapa: contas próprias de teste

Antes de ativar cadastro, provisionar PostgreSQL isolado com backup e restauração testada, SMTP externo com TLS e entrega comprovada, revisar Termos/Privacidade para o ambiente hospedado, executar migrações e testar isolamento entre duas contas. Isso exige outra alteração revisada e outra decisão de publicação. Não colocar credenciais de Produção do Asaas nesta etapa.

Para venda real, seguir as pendências das issues #3, #9, #10, #12, #14, #15, #16 e #30–#33 conforme o escopo escolhido para o piloto pago.
