# Banco e backup do piloto restrito

Este overlay prepara um PostgreSQL 18 próprio do piloto. Não abre porta para o host. A rede `database` é interna; somente `web` também participa dela. O volume `pilot_postgres_data` contém os dados e **não deve ser removido** durante atualização. O cadastro permanece desativado até a ativação separada da aplicação.

## Preparação local no servidor

Na pasta `deploy/pilot`, criar o segredo fora do Git:

```sh
umask 077
mkdir -p secrets
chmod 700 secrets
(set -C; openssl rand -hex 32 > secrets/postgres_password)
chmod 644 secrets/postgres_password
docker compose -f compose.yaml -f compose.database.yaml config --quiet
```

Gerar o arquivo somente no provisionamento inicial; não substituí-lo depois que o banco tiver dados. O `set -C` impede sobrescrever um arquivo existente. O diretório `secrets` fica com modo `0700` no host. O arquivo fica com modo `0644` para que os processos sem privilégio dos contêineres o leiam: em Compose, segredos vindos de arquivo são montados por bind e não recebem remapeamento de permissões. O diretório privado do host impede outros usuários locais de alcançá-lo. O mesmo segredo é montado em `db` e `web`. O inicializador de `web` forma `DATABASE_URL` em memória. Não imprimir `docker compose config` integralmente nem passar a senha em argumentos.

Após a revisão e autorização da publicação, iniciar a stack com os dois arquivos Compose e confirmar que `db` está saudável antes das migrações. Usar sempre os dois arquivos nos comandos de operação desta stack. **Não** executar `down --volumes` nela.

## Backup diário

Agendar `backup/backup.sh` uma vez ao dia no cron do host, por exemplo às 03:15 no horário configurado do servidor:

```cron
15 3 * * * /caminho/da/stack/deploy/pilot/backup/backup.sh
```

O script grava `pg_dump` em formato customizado no diretório estável `/opt/stacks/liquido-pilot/backups`, fora das pastas de release, e publica o arquivo somente após o comando terminar. Não remove backups automaticamente até haver uma política de retenção aprovada. O diretório privado e o segredo estão fora do Git e do contexto de build. Monitorar falhas do cron e espaço em disco. Estes backups ficam no **mesmo host** que o banco: eles não cobrem perda do VPS e não comprovam prontidão de backup externo.

## Ensaio de restauração

Executar `backup/verify-restore.sh /opt/stacks/liquido-pilot/backups/liquido-YYYYMMDDTHHMMSSZ-PID.dump`. O script cria um projeto Compose exclusivo com banco em `tmpfs`, restaura o dump em `restore_test`, confere que há tabelas públicas e remove o projeto no final. Ele não usa o serviço `db` nem a senha do piloto. Guarde a data e o resultado do ensaio fora dos dados privados. Um resultado positivo comprova que o arquivo pode ser lido; não comprova todas as consultas da aplicação nem recuperação após perda do host.
