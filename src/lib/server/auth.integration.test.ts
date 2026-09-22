import { randomUUID } from "node:crypto";

import { config } from "dotenv";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  GET as authGet,
  POST as authPost,
} from "@/app/api/auth/[...all]/route";

import {
  consumeOneTimeVerificationUrl,
  getAuth,
  getAuthBaseUrl,
  requireVerifiedSession,
  resetAuthForTests,
} from "./auth";
import {
  closeDbForTests,
  consumeEmailVerificationTokenRecord,
  createEmailVerificationTokenRecord,
  getDb,
} from "./db";
import { resetMailerForTests } from "./mailer";

config({ path: ".env.local", quiet: true });

if (process.env.TEST_DATABASE_URL) {
  const testUrl = new URL(process.env.TEST_DATABASE_URL);
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(testUrl.hostname) ||
    testUrl.pathname !== "/precopronto_integration"
  ) {
    throw new Error(
      "Use o banco local dedicado precopronto_integration para os testes destrutivos.",
    );
  }
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

process.env.AUTH_ENABLED = "true";

const describeWithDatabase = process.env.TEST_DATABASE_URL
  ? describe
  : describe.skip;
const mailboxUrl = "http://127.0.0.1:18025/messages";

interface LocalMailboxMessage {
  to: string;
  subject: string;
  text: string;
}

function makeAuthRequest(
  path: string,
  options: {
    body?: Record<string, unknown>;
    cookie?: string;
    method?: "GET" | "POST";
  } = {},
): Request {
  const baseUrl = getAuthBaseUrl();
  const headers = new Headers({ origin: baseUrl });

  if (options.cookie) {
    headers.set("cookie", options.cookie);
  }

  if (options.body) {
    headers.set("content-type", "application/json");
  }

  return new Request(`${baseUrl}/api/auth${path}`, {
    method: options.method ?? "POST",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

function sessionCookie(response: Response): string {
  const setCookie = response.headers.get("set-cookie");

  if (!setCookie) {
    throw new Error("A resposta de autenticação não trouxe sessão.");
  }

  return setCookie.split(";", 1)[0] ?? "";
}

function emailLink(message: LocalMailboxMessage, path: string): string {
  const urls = message.text.match(/https?:\/\/[^\s<>"']+/g) ?? [];
  const matchedUrl = urls.find((candidate) => {
    try {
      return new URL(candidate.replace(/[),.;!?]+$/, "")).pathname.startsWith(
        path,
      );
    } catch {
      return false;
    }
  });

  if (!matchedUrl) {
    throw new Error("O e-mail não continha o link de autenticação esperado.");
  }

  return matchedUrl.replace(/[),.;!?]+$/, "");
}

async function mailboxMessage(
  recipient: string,
  subject: string,
): Promise<LocalMailboxMessage> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await fetch(mailboxUrl);
    const messages = (await response.json()) as LocalMailboxMessage[];
    const message = [...messages]
      .reverse()
      .find(
        (candidate) =>
          candidate.to.includes(recipient) && candidate.subject === subject,
      );

    if (message) {
      return message;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("O SMTP local não recebeu o e-mail de autenticação.");
}

async function clearTestDatabase(): Promise<void> {
  if (
    !process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL
  ) {
    throw new Error("A limpeza de autenticação exige o banco de teste.");
  }

  await getDb().query(`
    TRUNCATE TABLE
      auth_email_verification_tokens,
      "rateLimit",
      verification,
      session,
      account,
      "user"
    RESTART IDENTITY CASCADE
  `);
}

describeWithDatabase("auth integration", () => {
  beforeEach(async () => {
    resetMailerForTests();
    await clearTestDatabase();
  });

  afterAll(async () => {
    await clearTestDatabase();
    resetMailerForTests();
    resetAuthForTests();
    await closeDbForTests();
  });

  it("consumeEmailVerificationTokenRecord_concurrentUse_onlyFirstSucceeds", async () => {
    const token = randomUUID();
    const recordId = await createEmailVerificationTokenRecord(
      token,
      new Date(Date.now() + 60_000),
    );
    const results = await Promise.all([
      consumeEmailVerificationTokenRecord(recordId, token),
      consumeEmailVerificationTokenRecord(recordId, token),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await consumeOneTimeVerificationUrl(recordId, token)).toBe(false);
  });

  it("consumeEmailVerificationTokenRecord_expiredToken_rejectsUse", async () => {
    const token = randomUUID();
    const recordId = await createEmailVerificationTokenRecord(
      token,
      new Date(Date.now() - 1_000),
    );

    expect(await consumeEmailVerificationTokenRecord(recordId, token)).toBe(
      false,
    );
  });

  it("authPost_signupVerifyLoginResetLogout_fullFlow", async () => {
    const email = `auth-test-${randomUUID()}@precopronto.test`;
    const password = "senha-de-teste-segura";
    const signupResponse = await authPost(
      makeAuthRequest("/sign-up/email", {
        body: {
          name: "Conta de teste",
          email,
          password,
          termsAccepted: true,
          termsVersion: "forjada",
          privacyVersion: "forjada",
          marketingConsent: true,
          callbackURL: "/entrar?verificado=1",
        },
      }),
    );

    expect(signupResponse.status).toBe(200);
    expect(signupResponse.headers.get("set-cookie")).toBeNull();

    const user = await getDb().query<{
      termsAccepted: boolean;
      termsVersion: string;
      privacyVersion: string;
      marketingConsent: boolean;
    }>(
      `
        SELECT
          terms_accepted AS "termsAccepted",
          terms_version AS "termsVersion",
          privacy_version AS "privacyVersion",
          marketing_consent AS "marketingConsent"
        FROM "user"
        WHERE email = $1
      `,
      [email],
    );

    expect(user.rows).toEqual([
      {
        termsAccepted: true,
        termsVersion: "2026-09-22",
        privacyVersion: "2026-09-22",
        marketingConsent: true,
      },
    ]);

    const verificationMessage = await mailboxMessage(
      email,
      "Confirme seu e-mail no PreçoPronto",
    );
    const verificationUrl = emailLink(
      verificationMessage,
      "/api/auth/verify-email",
    );

    const blockedLogin = await authPost(
      makeAuthRequest("/sign-in/email", {
        body: { email, password, callbackURL: "/app" },
      }),
    );

    expect(blockedLogin.status).toBe(403);
    const verifiedResponse = await authGet(new Request(verificationUrl));

    expect(verifiedResponse.status).toBe(302);
    expect(verifiedResponse.headers.get("location")).toContain(
      "/entrar?verificado=1",
    );
    expect(verifiedResponse.headers.get("set-cookie")).toBeNull();

    const replayUrl = new URL(verificationUrl);
    replayUrl.pathname = "/api/auth/verify-email/";
    const replayResponse = await authGet(new Request(replayUrl));

    expect(replayResponse.status).toBe(302);
    expect(replayResponse.headers.get("location")).toContain(
      "error=INVALID_TOKEN",
    );

    const loginResponse = await authPost(
      makeAuthRequest("/sign-in/email", {
        body: { email, password, callbackURL: "/app" },
      }),
    );
    const loggedInCookie = sessionCookie(loginResponse);

    expect(loginResponse.status).toBe(200);
    expect(
      await requireVerifiedSession(new Headers({ cookie: loggedInCookie })),
    ).not.toBeNull();

    const resetRequestResponse = await authPost(
      makeAuthRequest("/request-password-reset", {
        body: { email, redirectTo: "/redefinir-senha" },
      }),
    );

    expect(resetRequestResponse.status).toBe(200);

    const resetMessage = await mailboxMessage(
      email,
      "Redefina sua senha do PreçoPronto",
    );
    const resetUrl = emailLink(resetMessage, "/api/auth/reset-password/");
    const resetLinkResponse = await authGet(new Request(resetUrl));
    const resetRedirect = resetLinkResponse.headers.get("location");

    expect(resetLinkResponse.status).toBe(302);
    expect(resetRedirect).not.toBeNull();

    const resetToken = new URL(
      resetRedirect ?? getAuthBaseUrl(),
    ).searchParams.get("token");

    expect(resetToken).not.toBeNull();

    const newPassword = "senha-nova-de-teste-segura";
    const resetPasswordResponse = await authPost(
      makeAuthRequest("/reset-password", {
        body: { token: resetToken, newPassword },
      }),
    );

    expect(resetPasswordResponse.status).toBe(200);
    expect(
      await requireVerifiedSession(new Headers({ cookie: loggedInCookie })),
    ).toBeNull();

    const replayResetResponse = await authPost(
      makeAuthRequest("/reset-password", {
        body: { token: resetToken, newPassword },
      }),
    );

    expect(replayResetResponse.status).toBe(400);

    const renewedLoginResponse = await authPost(
      makeAuthRequest("/sign-in/email", {
        body: { email, password: newPassword, callbackURL: "/app" },
      }),
    );
    const renewedCookie = sessionCookie(renewedLoginResponse);

    expect(renewedLoginResponse.status).toBe(200);
    expect(
      await requireVerifiedSession(new Headers({ cookie: renewedCookie })),
    ).not.toBeNull();

    const logoutResponse = await authPost(
      makeAuthRequest("/sign-out", { cookie: renewedCookie }),
    );

    expect(logoutResponse.status).toBe(200);
    expect(
      await requireVerifiedSession(new Headers({ cookie: renewedCookie })),
    ).toBeNull();
  });

  it("authPost_missingTerms_rejectsSignup", async () => {
    const response = await authPost(
      makeAuthRequest("/sign-up/email", {
        body: {
          name: "Conta de teste",
          email: `auth-test-${randomUUID()}@precopronto.test`,
          password: "senha-de-teste-segura",
          termsAccepted: false,
        },
      }),
    );

    expect(response.status).toBe(400);
  });

  it("getAuth_noTrustedIpHeader_rateLimitsSharedBucket", async () => {
    const responses: Response[] = [];

    for (let attempt = 0; attempt < 6; attempt += 1) {
      responses.push(
        await getAuth().handler(
          makeAuthRequest("/sign-in/email", {
            body: {
              email: "email-invalido",
              password: "senha-de-teste-segura",
            },
          }),
        ),
      );
    }

    expect(responses.some((response) => response.status === 429)).toBe(true);
  });

  it("authPost_smtpFailure_returnsSanitizedServiceError", async () => {
    const originalPort = process.env.SMTP_PORT;
    process.env.SMTP_PORT = "1";
    resetMailerForTests();

    try {
      const response = await authPost(
        makeAuthRequest("/sign-up/email", {
          body: {
            name: "Conta de teste",
            email: `auth-test-${randomUUID()}@precopronto.test`,
            password: "senha-de-teste-segura",
            termsAccepted: true,
          },
        }),
      );
      const body = await response.text();

      expect(response.status).toBe(503);
      expect(body).toContain("temporariamente indisponível");
      expect(body).not.toContain("ECONNREFUSED");
      expect(body).not.toContain("Error:");
    } finally {
      if (originalPort === undefined) {
        delete process.env.SMTP_PORT;
      } else {
        process.env.SMTP_PORT = originalPort;
      }
      resetMailerForTests();
    }
  });

  it("requireVerifiedSession_withoutSession_returnsNull", async () => {
    expect(await requireVerifiedSession(new Headers())).toBeNull();
  });
});
