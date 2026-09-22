# Caixa de e-mail local

`scripts/local-mailbox.mjs` inicia um SMTP de desenvolvimento em `127.0.0.1:11025` e uma interface em `http://127.0.0.1:18025`. As mensagens ficam somente na memória do processo e desaparecem quando ele termina.

O servidor só inicia com `APP_ENV=local`. Ele aceita apenas destinatários no domínio `precopronto.test`; qualquer outro destinatário é recusado pelo SMTP. A interface e o SMTP escutam apenas em loopback, e o processo não encaminha mensagens para fora.

## Como iniciar

Enquanto o script `mailbox` ainda não estiver no `package.json`, execute:

```sh
APP_ENV=local node scripts/local-mailbox.mjs
```

Depois que o comando do projeto for configurado, o uso esperado será:

```sh
APP_ENV=local npm run mailbox
```

Abra [http://127.0.0.1:18025](http://127.0.0.1:18025) para listar as 20 mensagens mais recentes. A tela escapa o conteúdo recebido e só transforma em link URLs HTTP(S) para `localhost:3101` ou `127.0.0.1:3101`, adequadas aos links locais de verificação e redefinição.

## Configuração do app

Use o transporte SMTP local sem autenticação e sem TLS:

```text
host: 127.0.0.1
port: 11025
secure: false
auth: desabilitada
from: qualquer remetente de desenvolvimento
to: usuario@precopronto.test
```

Com Nodemailer, a configuração mínima é:

```js
const transporter = nodemailer.createTransport({
  host: "127.0.0.1",
  port: 11025,
  secure: false,
});
```

O servidor decodifica assunto RFC 2047 e corpos `text/plain` em `7bit`, `base64` ou `quoted-printable`. Mensagens multipart procuram a primeira parte de texto simples; HTML é convertido para texto como fallback. A API mantém apenas o contrato abaixo:

```http
GET http://127.0.0.1:18025/messages
```

```json
[
  {
    "id": "message-1",
    "to": "bruno@precopronto.test",
    "subject": "Verifique seu e-mail",
    "text": "Abra http://localhost:3101/verify?token=..."
  }
]
```

Não há CORS aberto: a UI consulta `/messages` na mesma origem. O endpoint só responde a clientes locais e não deve ser exposto por proxy, túnel ou bind público.

## Limites e prova

O log do processo informa somente as portas de escuta e, ao receber uma mensagem, seu ID e a contagem total. Não registra destinatário, assunto, corpo, token, senha ou credencial. Não há banco, arquivo de fila ou persistência.

Esta caixa comprova entrega SMTP local durante o desenvolvimento. Ela não comprova entrega em produção, configuração de domínio, autenticação de remetente, reputação ou recebimento externo.
