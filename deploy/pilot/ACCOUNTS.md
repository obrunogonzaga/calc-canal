# Preparação de contas no piloto restrito

O site publicado continua somente com a calculadora até uma liberação separada. O banco e o remetente podem ser preparados sem abrir cadastro ou pagamento.

## Requisitos antes de ativar

- Aprovar Termos e Privacidade para dados hospedados, canal de suporte, retenção e exclusão. Enquanto isso, usar somente contas próprias e dados fictícios.
- Confirmar `useliquido.com.br` como domínio de envio no Resend e guardar uma chave **Sending access** limitada a esse domínio em `secrets/resend_api_key`, fora do Git.
- Definir os e-mails exatos dos convidados em `PILOT_ALLOWED_EMAILS` na `.env` privada. O servidor recusa cadastro não convidado; não aceitar domínio inteiro como convite.
- Criar `secrets/auth_secret` com pelo menos 32 caracteres aleatórios. O banco usa `secrets/postgres_password`, conforme [backup/README.md](backup/README.md). Proteger o diretório no host e nunca exibir valores em logs ou `docker compose config`.
- Revisar e integrar o SHA de release. Definir `LIQUIDO_IMAGE_TAG` para esse SHA e manter `LIQUIDO_AUTH_ENABLED=false` até o momento da ativação.

## Sequência de publicação

1. Validar os três arquivos Compose com `config --quiet`: `compose.yaml`, `compose.database.yaml` e `compose.accounts.yaml`. O overlay de banco fixa `AUTH_ENABLED=false`, permitindo iniciar o PostgreSQL sem abrir cadastro.
2. Iniciar somente `db` com os dois primeiros arquivos. Confirmar o healthcheck. Não publicar porta do banco nem conectar a stack de outro produto.
3. Com os três arquivos, construir `migrator` e a nova imagem `web` sem substituir o site atual. Executar o migrador uma vez usando o perfil `migrate`; ele precisa do banco e dos segredos, mas não envia e-mails.
4. Executar `backup/backup.sh`, testar o dump com `backup/verify-restore.sh` e registrar os tempos. Só agendar backup diário após conferir que o teste realmente restaura tabelas. Cópias no mesmo VPS não substituem backup externo para um piloto pago.
5. Iniciar `web` com os três overlays e a imagem revisada. Esta etapa recria apenas o contêiner do Líquido e pode causar uma breve indisponibilidade do piloto.
6. Conferir HTTPS e senha, `noindex`, cadastro permitido e negado, e-mails de verificação e recuperação, login, isolamento entre duas contas, catálogo e checkout desativado. Não convidar terceiros antes dessa evidência.

Para recuar, voltar à imagem anterior da calculadora com `AUTH_ENABLED=false`; preservar o volume PostgreSQL. Não executar `down --volumes` na stack do piloto.
