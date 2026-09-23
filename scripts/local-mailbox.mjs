import { createServer } from "node:http";
import { SMTPServer } from "smtp-server";

const SMTP_HOST = "127.0.0.1";
const SMTP_PORT = 11025;
const HTTP_HOST = "127.0.0.1";
const HTTP_PORT = 18025;
const ALLOWED_RECIPIENT_DOMAIN = "precopronto.test";
const LOCAL_APP_PORT = "3101";

const messages = [];
let nextMessageId = 1;

function isLoopbackHost(host) {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

function isLoopbackAddress(address) {
  const normalized = String(address ?? "").toLowerCase().replace(/^::ffff:/, "");
  return isLoopbackHost(normalized);
}

function addressText(address) {
  if (typeof address === "string") return address.trim();
  return String(address?.address ?? "").trim();
}

function isAllowedRecipient(address) {
  const value = addressText(address);
  const at = value.lastIndexOf("@");
  return (
    at > 0 &&
    value.slice(at + 1).toLowerCase() === ALLOWED_RECIPIENT_DOMAIN
  );
}

function decodeBytes(bytes, charset = "utf-8") {
  const normalized = charset.toLowerCase().replace(/["']/g, "").trim();
  try {
    return new TextDecoder(normalized).decode(bytes);
  } catch {
    return Buffer.from(bytes).toString("utf8");
  }
}

function decodeQuotedPrintable(value) {
  const input = value.replace(/=(?:\r\n|\n)/g, "");
  const bytes = [];

  for (let index = 0; index < input.length; index += 1) {
    if (
      input[index] === "=" &&
      /^[0-9a-f]{2}$/i.test(input.slice(index + 1, index + 3))
    ) {
      bytes.push(Number.parseInt(input.slice(index + 1, index + 3), 16));
      index += 2;
      continue;
    }

    const encoded = Buffer.from(input[index], "utf8");
    for (const byte of encoded) bytes.push(byte);
  }

  return Buffer.from(bytes);
}

function decodeTransferBody(value, transferEncoding, charset) {
  const transfer = transferEncoding.toLowerCase().trim();
  if (transfer === "base64") {
    return decodeBytes(Buffer.from(value.replace(/\s+/g, ""), "base64"), charset);
  }
  if (transfer === "quoted-printable") {
    return decodeBytes(decodeQuotedPrintable(value), charset);
  }
  return decodeBytes(Buffer.from(value, "utf8"), charset);
}

function decodeEncodedWord(value) {
  return value.replace(
    /=\?([^?\s]+)\?([bq])\?([^?]*)\?=/gi,
    (_match, charset, encoding, encoded) => {
      if (encoding.toLowerCase() === "b") {
        return decodeBytes(Buffer.from(encoded, "base64"), charset);
      }
      return decodeBytes(
        decodeQuotedPrintable(encoded.replace(/_/g, " ")),
        charset,
      );
    },
  );
}

function parseHeaders(headerText) {
  const headers = new Map();
  let currentName = "";
  let currentValue = "";

  const commit = () => {
    if (!currentName) return;
    const name = currentName.toLowerCase();
    const previous = headers.get(name);
    headers.set(name, previous ? `${previous}, ${currentValue}` : currentValue);
  };

  for (const line of headerText.replace(/\r\n/g, "\n").split("\n")) {
    if (/^[ \t]/.test(line) && currentName) {
      currentValue += ` ${line.trim()}`;
      continue;
    }

    commit();
    const separator = line.indexOf(":");
    if (separator <= 0) {
      currentName = "";
      currentValue = "";
      continue;
    }

    currentName = line.slice(0, separator).trim();
    currentValue = line.slice(separator + 1).trim();
  }
  commit();
  return headers;
}

function splitEntity(raw) {
  const separator = raw.search(/\r?\n\r?\n/);
  if (separator < 0) return { headers: new Map(), body: raw };

  const separatorLength = raw[separator] === "\r" ? 4 : 2;
  return {
    headers: parseHeaders(raw.slice(0, separator)),
    body: raw.slice(separator + separatorLength),
  };
}

function contentTypeInfo(value) {
  const type = (value.split(";", 1)[0] || "text/plain").trim().toLowerCase();
  const charset = value.match(/(?:^|;)\s*charset\s*=\s*(?:"([^"]+)"|([^;\s]+))/i);
  const boundary = value.match(/(?:^|;)\s*boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i);
  return {
    type,
    charset: charset?.[1] ?? charset?.[2] ?? "utf-8",
    boundary: boundary?.[1] ?? boundary?.[2] ?? "",
  };
}

function stripHtml(value) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function extractMimeText(raw) {
  const entity = splitEntity(raw);
  const typeInfo = contentTypeInfo(entity.headers.get("content-type") ?? "text/plain");

  if (typeInfo.type.startsWith("multipart/") && typeInfo.boundary) {
    let fallback = null;
    const parts = entity.body.split(`--${typeInfo.boundary}`);
    for (const part of parts) {
      if (!part || part.trimStart().startsWith("--")) continue;
      const text = extractMimeText(part.replace(/^\r?\n/, ""));
      if (!text) continue;
      if (text.kind === "plain") return text;
      fallback ??= text;
    }
    return fallback;
  }

  const body = decodeTransferBody(
    entity.body,
    entity.headers.get("content-transfer-encoding") ?? "7bit",
    typeInfo.charset,
  );

  if (typeInfo.type === "text/html") return { kind: "html", text: stripHtml(body) };
  if (typeInfo.type === "text/plain" || !typeInfo.type) return { kind: "plain", text: body };
  return null;
}

function parseMessage(raw, recipients) {
  const entity = splitEntity(raw);
  const subject = decodeEncodedWord(entity.headers.get("subject") ?? "").trim();
  const parsedText = extractMimeText(raw);
  const text = (parsedText?.text ?? entity.body).replace(/\r\n/g, "\n").trim();

  return {
    id: `message-${nextMessageId++}`,
    to: recipients.join(", "),
    subject,
    text,
  };
}

async function readStream(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(value));
}

const UI = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Caixa de e-mail local — Líquido</title>
    <style>
      :root { color-scheme: light; font-family: system-ui, sans-serif; }
      body { margin: 0; background: #f5f5f5; color: #202124; }
      main { box-sizing: border-box; max-width: 900px; margin: 0 auto; padding: 2rem 1rem; }
      header, article { background: white; border: 1px solid #ddd; border-radius: 0.75rem; padding: 1rem; }
      header { margin-bottom: 1rem; }
      h1 { font-size: 1.35rem; margin: 0 0 0.35rem; }
      p { margin: 0.35rem 0; }
      button { border: 0; border-radius: 0.4rem; background: #164e63; color: white; cursor: pointer; padding: 0.55rem 0.8rem; }
      ol { display: grid; gap: 0.75rem; list-style: none; margin: 0; padding: 0; }
      article h2 { font-size: 1rem; margin: 0 0 0.3rem; }
      article dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.2rem 0.75rem; margin: 0.6rem 0; }
      article dt { color: #555; font-weight: 600; }
      article dd { margin: 0; overflow-wrap: anywhere; }
      pre { background: #f7f7f7; border-radius: 0.4rem; overflow-x: auto; padding: 0.75rem; white-space: pre-wrap; }
      .empty { color: #555; }
      .links { display: flex; flex-wrap: wrap; gap: 0.5rem; }
      .links a { color: #075985; }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>Caixa de e-mail local</h1>
        <p>Mensagens recebidas apenas em <code>*@precopronto.test</code>; nada é persistido.</p>
        <button type="button" id="refresh">Atualizar</button>
        <p id="status" role="status" aria-live="polite">Carregando…</p>
      </header>
      <ol id="messages" aria-label="Mensagens recebidas"></ol>
    </main>
    <script>
      const messageList = document.getElementById('messages');
      const status = document.getElementById('status');
      const linkPattern = /https?:\\/\\/[^\\s<>"']+/gi;

      function localLinks(text) {
        const values = text.match(linkPattern) || [];
        return [...new Set(values.map((value) => value.replace(/[),.;!?]+$/, '')))].filter((value) => {
          try {
            const url = new URL(value);
            return (url.protocol === 'http:' || url.protocol === 'https:') &&
              url.port === '${LOCAL_APP_PORT}' &&
              (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
          } catch {
            return false;
          }
        });
      }

      function addField(parent, label, value) {
        const term = document.createElement('dt');
        term.textContent = label;
        const description = document.createElement('dd');
        description.textContent = value || '(vazio)';
        parent.append(term, description);
      }

      function render(messages) {
        messageList.replaceChildren();
        if (!messages.length) {
          const empty = document.createElement('li');
          empty.className = 'empty';
          empty.textContent = 'Nenhuma mensagem recebida ainda.';
          messageList.append(empty);
          return;
        }

        messages.slice(-20).reverse().forEach((message) => {
          const item = document.createElement('li');
          const article = document.createElement('article');
          const heading = document.createElement('h2');
          heading.textContent = message.subject || '(sem assunto)';
          const details = document.createElement('dl');
          addField(details, 'ID', message.id);
          addField(details, 'Para', message.to);
          const body = document.createElement('pre');
          body.textContent = message.text;
          const links = document.createElement('div');
          links.className = 'links';
          localLinks(message.text).forEach((href) => {
            const link = document.createElement('a');
            link.href = href;
            link.target = '_blank';
            link.rel = 'noreferrer noopener';
            link.textContent = 'Abrir link local de verificação/redefinição';
            links.append(link);
          });
          article.append(heading, details, body);
          if (links.childElementCount) article.append(links);
          item.append(article);
          messageList.append(item);
        });
      }

      async function loadMessages() {
        status.textContent = 'Carregando…';
        try {
          const response = await fetch('/messages', { headers: { Accept: 'application/json' } });
          if (!response.ok) throw new Error('HTTP ' + response.status);
          const data = await response.json();
          render(data);
          status.textContent = data.length + (data.length === 1 ? ' mensagem' : ' mensagens');
        } catch {
          status.textContent = 'Não foi possível carregar as mensagens.';
        }
      }

      document.getElementById('refresh').addEventListener('click', loadMessages);
      loadMessages();
    </script>
  </body>
</html>`;

function createHttpServer() {
  return createServer((request, response) => {
    if (!isLoopbackAddress(request.socket.remoteAddress)) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Apenas clientes locais são aceitos.\n");
      return;
    }

    if (request.method === "GET" && request.url === "/") {
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'",
        "Content-Type": "text/html; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(UI);
      return;
    }

    if (request.method === "GET" && request.url === "/messages") {
      sendJson(response, 200, messages);
      return;
    }

    sendJson(response, 404, { error: "not_found" });
  });
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    const eventTarget = server.server ?? server;
    const onError = (error) => {
      eventTarget.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      eventTarget.off("error", onError);
      resolve();
    };
    eventTarget.once("error", onError);
    eventTarget.once("listening", onListening);
    server.listen(port, host);
  });
}

function close(server) {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

async function start() {
  if (!isLoopbackHost(SMTP_HOST) || !isLoopbackHost(HTTP_HOST)) {
    throw new Error("Mailbox hosts must be loopback addresses");
  }

  const smtpServer = new SMTPServer({
    authOptional: true,
    disabledCommands: ["AUTH", "STARTTLS"],
    hideSTARTTLS: true,
    logger: false,
    onConnect(session, callback) {
      if (!isLoopbackAddress(session.remoteAddress)) {
        const error = new Error("Local connections only");
        error.responseCode = 421;
        callback(error);
        return;
      }
      callback();
    },
    onRcptTo(address, _session, callback) {
      if (!isAllowedRecipient(address)) {
        const error = new Error("Only precopronto.test recipients are accepted");
        error.responseCode = 550;
        callback(error);
        return;
      }
      callback();
    },
    onData(stream, session, callback) {
      readStream(stream)
        .then((raw) => {
          const recipients = session.envelope.rcptTo.map(addressText).filter(Boolean);
          if (!recipients.length || recipients.some((recipient) => !isAllowedRecipient(recipient))) {
            const error = new Error("Only precopronto.test recipients are accepted");
            error.responseCode = 550;
            callback(error);
            return;
          }

          const message = parseMessage(raw, recipients);
          messages.push(message);
          console.log(`[mailbox] received ${message.id} total=${messages.length}`);
          callback();
        })
        .catch(callback);
    },
  });
  const httpServer = createHttpServer();

  try {
    await listen(smtpServer, SMTP_PORT, SMTP_HOST);
    await listen(httpServer, HTTP_PORT, HTTP_HOST);
  } catch (error) {
    await Promise.allSettled([close(smtpServer), close(httpServer)]);
    throw error;
  }

  console.log(`[mailbox] smtp=${SMTP_HOST}:${SMTP_PORT} http=http://${HTTP_HOST}:${HTTP_PORT}`);

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await Promise.allSettled([close(smtpServer), close(httpServer)]);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

if (process.env.APP_ENV !== "local") {
  console.error("[mailbox] refused: set APP_ENV=local");
  process.exitCode = 1;
} else {
  start().catch((error) => {
    console.error(`[mailbox] failed to start: ${error.message}`);
    process.exitCode = 1;
  });
}
