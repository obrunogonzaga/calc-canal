import { describe, expect, it } from "vitest";

import { requireSignupAccess } from "./signup-access";

describe("requireSignupAccess", () => {
  it("requireSignupAccess_productionWithoutMode_rejectsSignup", () => {
    expect(() =>
      requireSignupAccess("seller@example.com", { APP_ENV: "production" }),
    ).toThrow("contas convidadas");
  });

  it("requireSignupAccess_inviteOnlyMatchingEmail_allowsSignup", () => {
    expect(() =>
      requireSignupAccess(" Seller@Example.com ", {
        APP_ENV: "production",
        SIGNUP_ACCESS: "invite-only",
        PILOT_ALLOWED_EMAILS: "owner@example.com, seller@example.com",
      }),
    ).not.toThrow();
  });

  it("requireSignupAccess_inviteOnlyDifferentEmail_rejectsSignup", () => {
    expect(() =>
      requireSignupAccess("stranger@example.com", {
        APP_ENV: "production",
        SIGNUP_ACCESS: "invite-only",
        PILOT_ALLOWED_EMAILS: "owner@example.com, seller@example.com",
      }),
    ).toThrow("contas convidadas");
  });

  it("requireSignupAccess_inviteOnlyEmptyList_rejectsSignup", () => {
    expect(() =>
      requireSignupAccess("seller@example.com", {
        APP_ENV: "production",
        SIGNUP_ACCESS: "invite-only",
        PILOT_ALLOWED_EMAILS: "  ",
      }),
    ).toThrow("contas convidadas");
  });
});
