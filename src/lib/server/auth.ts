import { isIP } from "node:net";
import { AsyncLocalStorage } from "node:async_hooks";

import { betterAuth } from "better-auth";

import {
  PRIVACY_VERSION,
  resolveSignupConsent,
  TERMS_VERSION,
  type SignupConsentInput,
} from "./account-consent";
import {
  consumeEmailVerificationTokenRecord,
  createEmailVerificationTokenRecord,
  getDb,
} from "./db";
import {
  sendPasswordResetEmail,
  sendVerificationEmail as sendVerificationMessage,
} from "./mailer";
import { requireSignupAccess } from "./signup-access";

const EMAIL_VERIFICATION_TTL_SECONDS = 60 * 60;
const MIN_AUTH_SECRET_LENGTH = 32;

interface EmailDeliveryState {
  failed: boolean;
}

const emailDeliveryState = new AsyncLocalStorage<EmailDeliveryState>();

function markEmailDeliveryFailure(): void {
  const state = emailDeliveryState.getStore();

  if (state) {
    state.failed = true;
  }
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.replace(/^\[|\]$/g, "").toLowerCase();

  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    (isIP(normalized) === 4 && normalized.startsWith("127."))
  );
}

export function isVerificationPathname(pathname: string): boolean {
  try {
    return (
      decodeURIComponent(pathname).replace(/\/+$/, "") ===
      "/api/auth/verify-email"
    );
  } catch {
    return false;
  }
}

function readAuthUrl(): string {
  const canonicalUrl = process.env.BETTER_AUTH_URL?.trim();
  const legacyUrl = process.env.AUTH_BASE_URL?.trim();

  if (canonicalUrl && legacyUrl && canonicalUrl !== legacyUrl) {
    throw new Error("As URLs de autenticação configuradas não coincidem.");
  }

  const configuredUrl = canonicalUrl ?? legacyUrl;

  if (!configuredUrl) {
    throw new Error("A URL de autenticação não está configurada.");
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(configuredUrl);
  } catch {
    throw new Error("A URL de autenticação não é válida.");
  }

  if (
    (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") ||
    (parsedUrl.pathname !== "/" && parsedUrl.pathname !== "")
  ) {
    throw new Error("A URL de autenticação deve apontar para a origem do app.");
  }

  if (
    parsedUrl.protocol === "http:" &&
    (process.env.APP_ENV !== "local" || !isLoopbackHost(parsedUrl.hostname))
  ) {
    throw new Error("HTTP só é permitido para autenticação local em loopback.");
  }

  return parsedUrl.origin;
}

function readAuthSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;

  if (!secret || secret.length < MIN_AUTH_SECRET_LENGTH) {
    throw new Error(
      "O segredo de autenticação não está configurado com segurança.",
    );
  }

  return secret;
}

function getTrustedProxyConfig(): {
  ipAddressHeaders: string[];
  trustedProxies?: string[];
} {
  const trustedProxies = process.env.AUTH_TRUSTED_PROXIES?.split(",")
    .map((proxy) => proxy.trim())
    .filter(Boolean);

  if (!trustedProxies?.length) {
    // Sem uma origem de proxy explicitamente confiável, não aceite cabeçalhos
    // de IP que um cliente direto poderia falsificar.
    return { ipAddressHeaders: [] };
  }

  const broadPrivateRanges = new Set([
    "0.0.0.0/0",
    "::/0",
    "10.0.0.0/8",
    "172.16.0.0/12",
    "192.168.0.0/16",
  ]);

  if (trustedProxies.some((proxy) => broadPrivateRanges.has(proxy))) {
    throw new Error("A lista de proxies confiáveis é ampla demais.");
  }

  return {
    ipAddressHeaders: ["x-forwarded-for"],
    trustedProxies,
  };
}

function createAuth() {
  const baseURL = readAuthUrl();

  return betterAuth({
    appName: "Líquido",
    baseURL,
    basePath: "/api/auth",
    secret: readAuthSecret(),
    database: getDb(),
    trustedOrigins: [baseURL],
    advanced: {
      disableCSRFCheck: false,
      disableOriginCheck: false,
      trustedProxyHeaders: false,
      ipAddress: getTrustedProxyConfig(),
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 30,
      customRules: {
        "/sign-up/email": { window: 60, max: 5 },
        "/sign-in/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 60, max: 3 },
        "/send-verification-email": { window: 60, max: 3 },
      },
    },
    verification: {
      storeIdentifier: "hashed",
    },
    user: {
      additionalFields: {
        termsAccepted: {
          type: "boolean",
          fieldName: "terms_accepted",
          required: true,
          returned: false,
        },
        termsVersion: {
          type: "string",
          fieldName: "terms_version",
          required: true,
          defaultValue: TERMS_VERSION,
          input: false,
        },
        privacyVersion: {
          type: "string",
          fieldName: "privacy_version",
          required: true,
          defaultValue: PRIVACY_VERSION,
          input: false,
        },
        marketingConsent: {
          type: "boolean",
          fieldName: "marketing_consent",
          required: false,
          defaultValue: false,
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            requireSignupAccess(user.email);
            return {
              data: {
                ...user,
                ...resolveSignupConsent(user as SignupConsentInput),
              },
            };
          },
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: EMAIL_VERIFICATION_TTL_SECONDS,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        try {
          await sendPasswordResetEmail(user.email, url);
        } catch {
          markEmailDeliveryFailure();
        }
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
      expiresIn: EMAIL_VERIFICATION_TTL_SECONDS,
      sendVerificationEmail: async ({ user, url, token }) => {
        try {
          const oneTimeUrl = await createOneTimeVerificationUrl(url, token);
          await sendVerificationMessage(user.email, oneTimeUrl);
        } catch {
          markEmailDeliveryFailure();
        }
      },
    },
  });
}

export type LiquidoAuth = ReturnType<typeof createAuth>;

let authInstance: LiquidoAuth | undefined;

export function getAuth(): LiquidoAuth {
  authInstance ??= createAuth();
  return authInstance;
}

export function getAuthBaseUrl(): string {
  return readAuthUrl();
}

export function isAuthEnabled(): boolean {
  return process.env.AUTH_ENABLED === "true";
}

export async function runWithEmailDeliveryBoundary<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const state: EmailDeliveryState = { failed: false };

  return emailDeliveryState.run(state, async () => {
    const result = await operation();

    if (state.failed) {
      throw new Error("A entrega de e-mail de autenticação falhou.");
    }

    return result;
  });
}

export async function createOneTimeVerificationUrl(
  verificationUrl: string,
  token: string,
): Promise<string> {
  let url: URL;

  try {
    url = new URL(verificationUrl);
  } catch {
    throw new Error("Não foi possível preparar o link de verificação.");
  }

  const authBaseUrl = new URL(getAuthBaseUrl());

  if (
    url.origin !== authBaseUrl.origin ||
    !isVerificationPathname(url.pathname)
  ) {
    throw new Error("Não foi possível preparar o link de verificação.");
  }

  url.pathname = "/api/auth/verify-email";

  const recordId = await createEmailVerificationTokenRecord(
    token,
    new Date(Date.now() + EMAIL_VERIFICATION_TTL_SECONDS * 1000),
  );
  url.searchParams.set("verificationId", recordId);

  return url.toString();
}

export async function consumeOneTimeVerificationUrl(
  verificationId: string | null,
  token: string | null,
): Promise<boolean> {
  if (!verificationId || !token) {
    return false;
  }

  return consumeEmailVerificationTokenRecord(verificationId, token);
}

/**
 * Authentication is not resource authorization. Callers must still verify
 * ownership or a server-side permission for the operation they are handling.
 */
export async function requireVerifiedSession(headers: Headers) {
  const session = await getAuth().api.getSession({ headers });

  return session?.user.emailVerified ? session : null;
}

export function resetAuthForTests(): void {
  authInstance = undefined;
}
