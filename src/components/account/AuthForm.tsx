"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type Mode = "signup" | "signin" | "forgot" | "reset";
const genericError =
  "Não foi possível concluir. Confira os dados e tente novamente.";
const errorMessages: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD:
    "E-mail ou senha inválidos. Confira os dados ou recupere sua senha.",
  EMAIL_NOT_VERIFIED:
    "Confirme seu e-mail antes de entrar. Você pode pedir um novo link abaixo.",
  INVALID_TOKEN:
    "Este link expirou ou já foi usado. Peça um novo link de recuperação.",
  TOKEN_EXPIRED: "Este link expirou. Peça um novo link de recuperação.",
  PASSWORD_TOO_SHORT: "Use uma senha com pelo menos 12 caracteres.",
  PASSWORD_TOO_LONG: "A senha deve ter no máximo 128 caracteres.",
  USER_ALREADY_EXISTS:
    "Confira sua caixa de entrada. Se já tiver conta, entre ou recupere a senha.",
  TOO_MANY_REQUESTS:
    "Muitas tentativas em pouco tempo. Aguarde alguns minutos antes de tentar novamente.",
};

async function authRequest(endpoint: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/auth/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 503) throw new Error("O serviço de contas está temporariamente indisponível. Seus dados continuam no formulário; tente novamente.");
    const code = data.code || data.error?.code;
    throw new Error(
      response.status === 429
        ? errorMessages.TOO_MANY_REQUESTS
        : errorMessages[code] || genericError,
    );
  }
  return data;
}

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const params = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [terms, setTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const token = params.get("token");
  const expired = mode === "reset" && (!token || params.has("error"));

  async function resend() {
    setError(null);
    setNotice(null);
    if (!email.trim()) {
      setError("Informe seu e-mail para pedir outro link.");
      return;
    }
    setBusy(true);
    try {
      await authRequest("send-verification-email", {
        email: email.trim(),
        callbackURL: "/entrar?verificado=1",
      });
      setNotice(
        "Se houver uma conta aguardando confirmação, um novo link será enviado. Confira também o spam.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : genericError);
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (mode === "signup" && !terms) {
      setError(
        "Leia e aceite as condições da prévia e o aviso de privacidade.",
      );
      return;
    }
    if ((mode === "signup" || mode === "reset") && password !== confirmation) {
      setError("As senhas não coincidem.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        await authRequest("sign-up/email", {
          name: name.trim(),
          email: email.trim(),
          password,
          termsAccepted: true,
          marketingConsent: marketing,
          callbackURL: "/entrar?verificado=1",
        });
        setPassword("");
        setConfirmation("");
        setDone(true);
      } else if (mode === "signin") {
        await authRequest("sign-in/email", {
          email: email.trim(),
          password,
          callbackURL: "/app",
        });
        setPassword("");
        router.replace("/app");
        router.refresh();
      } else if (mode === "forgot") {
        await authRequest("request-password-reset", {
          email: email.trim(),
          redirectTo: "/redefinir-senha",
        });
        setDone(true);
      } else {
        if (!token) throw new Error(errorMessages.INVALID_TOKEN);
        await authRequest("reset-password", { newPassword: password, token });
        setPassword("");
        setConfirmation("");
        setDone(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : genericError);
    } finally {
      setBusy(false);
    }
  }
  if (!ready) return <p role="status">Preparando formulário…</p>;
  if (expired)
    return (
      <div className="account-message">
        <h2>Peça um novo link</h2>
        <p>
          O link de recuperação está ausente ou expirou. Seus dados continuam
          protegidos.
        </p>
        <Link className="button primary" href="/recuperar-senha">
          Recuperar acesso
        </Link>
      </div>
    );
  if (done)
    return (
      <div className="account-message" role="status">
        <h2>{mode === "reset" ? "Senha atualizada" : "Confira seu e-mail"}</h2>
        <p>
          {mode === "reset"
            ? "Entre novamente com sua nova senha. As sessões anteriores foram encerradas."
            : mode === "forgot"
              ? "Se existir uma conta para esse endereço, você receberá um link de recuperação com validade limitada."
              : "Se o cadastro puder prosseguir, você receberá um link para confirmar seu e-mail. Se já tiver conta, entre ou recupere a senha."}
        </p>
        {mode === "signup" && (
          <>
            <p>
              Sua simulação continua guardada nesta aba. Volte aqui depois de
              confirmar o e-mail.
            </p>
            <button
              type="button"
              className="text-button"
              onClick={resend}
              disabled={busy}
            >
              {busy ? "Enviando…" : "Reenviar confirmação"}
            </button>
          </>
        )}
        {notice && (
          <p role="status" className="success-banner">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="error-banner">
            {error}
          </p>
        )}
        <Link className="button primary" href="/entrar">
          Ir para entrar
        </Link>
        {mode === "signup" && (
          <Link className="text-link" href="/recuperar-senha">
            Já tenho conta e esqueci a senha
          </Link>
        )}
      </div>
    );
  return (
    <form onSubmit={submit} className="auth-form">
      {mode === "signin" &&
        params.get("verificado") === "1" &&
        !params.has("error") && (
          <p className="success-banner" role="status">
            E-mail confirmado. Entre para continuar.
          </p>
        )}
      {mode === "signin" && params.has("error") && (
        <p className="error-banner" role="alert">
          O link de confirmação expirou ou já foi usado. Se você já confirmou o
          e-mail, tente entrar. Caso contrário, informe seu e-mail e peça outro
          link.
        </p>
      )}
      {mode === "signup" && (
        <div className="field">
          <label htmlFor="name">Seu nome</label>
          <input
            id="name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            maxLength={100}
            required
          />
        </div>
      )}
      {mode !== "reset" && (
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={254}
            required
          />
        </div>
      )}
      {mode !== "forgot" && (
        <div className="field">
          <label htmlFor="password">
            {mode === "reset" ? "Nova senha" : "Senha"}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={
              mode === "signin" ? "current-password" : "new-password"
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={mode === "signin" ? undefined : 12}
            maxLength={128}
            required
          />
          {mode !== "signin" && (
            <p className="field-hint">
              Use pelo menos 12 caracteres. Evite reutilizar senhas.
            </p>
          )}
        </div>
      )}
      {(mode === "signup" || mode === "reset") && (
        <div className="field">
          <label htmlFor="confirmation">Confirme a senha</label>
          <input
            id="confirmation"
            name="confirmation"
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            minLength={12}
            maxLength={128}
            required
          />
        </div>
      )}
      {mode === "signup" && (
        <>
          <label className="checkbox-field">
            <input
              name="terms"
              type="checkbox"
              checked={terms}
              onChange={(e) => setTerms(e.target.checked)}
              required
            />
            <span>
              Li e aceito as{" "}
              <Link href="/termos" target="_blank">
                condições de uso
              </Link>{" "}
              e o{" "}
              <Link href="/privacidade" target="_blank">
                aviso de privacidade
              </Link>
              .
            </span>
          </label>
          <label className="checkbox-field">
            <input
              name="marketing"
              type="checkbox"
              checked={marketing}
              onChange={(e) => setMarketing(e.target.checked)}
            />
            <span>
              Quero receber novidades do Líquido por e-mail (opcional).
            </span>
          </label>
        </>
      )}
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success-banner" role="status">
          {notice}
        </p>
      )}
      <button className="button primary" disabled={busy} type="submit">
        {busy
          ? "Aguarde…"
          : {
              signup: "Criar conta gratuita",
              signin: "Entrar",
              forgot: "Enviar link de recuperação",
              reset: "Salvar nova senha",
            }[mode]}
      </button>
      {mode === "signin" && (
        <>
          <div className="auth-links">
            <Link href="/recuperar-senha">Esqueci minha senha</Link>
            <Link href="/cadastro">Criar conta</Link>
          </div>
          <button
            className="text-button"
            type="button"
            onClick={resend}
            disabled={busy}
          >
            Reenviar confirmação do e-mail
          </button>
        </>
      )}
      {(mode === "signup" || mode === "forgot" || mode === "reset") && (
        <Link className="text-link" href="/entrar">
          Já tenho acesso. Entrar
        </Link>
      )}
    </form>
  );
}
