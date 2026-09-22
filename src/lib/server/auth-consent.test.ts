import { describe, expect, it } from "vitest";

import {
  PRIVACY_VERSION,
  resolveSignupConsent,
  TERMS_VERSION,
  type SignupConsentInput,
} from "./account-consent";
import { isVerificationPathname } from "./auth";

describe("resolveSignupConsent", () => {
  it("resolveSignupConsent_requiredTermsAccepted_result", () => {
    expect(resolveSignupConsent({ termsAccepted: true })).toEqual({
      termsAccepted: true,
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      marketingConsent: false,
    });
  });

  it("resolveSignupConsent_serverVersions_overrideClientValues", () => {
    const input = {
      termsAccepted: true,
      marketingConsent: true,
      termsVersion: "forjada",
      privacyVersion: "forjada",
    } as SignupConsentInput;

    expect(resolveSignupConsent(input)).toMatchObject({
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      marketingConsent: true,
    });
  });

  it("resolveSignupConsent_missingTerms_error", () => {
    expect(() => resolveSignupConsent({ termsAccepted: false })).toThrow(
      "necessário aceitar"
    );
  });

  it("resolveSignupConsent_invalidMarketingConsent_error", () => {
    expect(() =>
      resolveSignupConsent({ termsAccepted: true, marketingConsent: "sim" })
    ).toThrow("marketing deve ser verdadeiro ou falso");
  });
});

describe("isVerificationPathname", () => {
  it("isVerificationPathname_normalizedVerificationPath_result", () => {
    expect(isVerificationPathname("/api/auth/verify-email/")).toBe(true);
    expect(isVerificationPathname("/api/auth/%76erify-email")).toBe(true);
  });

  it("isVerificationPathname_otherPath_result", () => {
    expect(isVerificationPathname("/api/auth/verify-email-extra")).toBe(false);
    expect(isVerificationPathname("/api/auth/%zz")).toBe(false);
  });
});
