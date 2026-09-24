import { APIError } from "better-auth/api";

export const TERMS_VERSION = "2026-09-24";
export const PRIVACY_VERSION = "2026-09-24";

export interface SignupConsentInput {
  termsAccepted?: unknown;
  marketingConsent?: unknown;
}

export interface ServerAccountConsent {
  termsAccepted: true;
  termsVersion: string;
  privacyVersion: string;
  marketingConsent: boolean;
}

export function resolveSignupConsent(
  input: SignupConsentInput
): ServerAccountConsent {
  if (input.termsAccepted !== true) {
    throw new APIError("BAD_REQUEST", {
      message: "É necessário aceitar os Termos de Uso para criar a conta.",
    });
  }

  if (
    input.marketingConsent !== undefined &&
    typeof input.marketingConsent !== "boolean"
  ) {
    throw new APIError("BAD_REQUEST", {
      message: "O consentimento de marketing deve ser verdadeiro ou falso.",
    });
  }

  return {
    termsAccepted: true,
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    marketingConsent: input.marketingConsent ?? false,
  };
}
