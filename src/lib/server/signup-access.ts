import { APIError } from "better-auth/api";

type SignupEnvironment = Record<string, string | undefined>;

export function requireSignupAccess(
  email: string,
  environment: SignupEnvironment = process.env,
): void {
  const mode = environment.SIGNUP_ACCESS ??
    (environment.APP_ENV === "production" ? "closed" : "open");

  if (mode === "open") return;

  if (mode === "invite-only") {
    const normalizedEmail = email.trim().toLowerCase();
    const allowedEmails = environment.PILOT_ALLOWED_EMAILS?.split(",")
      .map((allowed) => allowed.trim().toLowerCase())
      .filter(Boolean) ?? [];

    if (allowedEmails.includes(normalizedEmail)) return;
  }

  throw new APIError("FORBIDDEN", {
    message: "O cadastro está disponível apenas para contas convidadas.",
  });
}
