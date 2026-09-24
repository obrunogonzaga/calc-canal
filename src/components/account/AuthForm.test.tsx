// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthForm } from "./AuthForm";
const routing = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  query: "",
}));
vi.mock("next/navigation", () => ({
  useRouter: () => routing,
  useSearchParams: () => new URLSearchParams(routing.query),
}));
beforeEach(() => {
  routing.query = "";
  routing.replace.mockReset();
  routing.refresh.mockReset();
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function response(ok = true, data: unknown = {}) {
  return { ok, status: ok ? 200 : 400, json: async () => data } as Response;
}
async function credentials(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByLabelText("E-mail", { exact: true }),
    "teste@precopronto.test",
  );
  await user.type(
    screen.getByLabelText("Senha", { exact: true }),
    "senha-de-teste-segura",
  );
}
describe("AuthForm", () => {
  it("signIn_invalidCredentials_keepsEmailAndShowsRecovery", async () => {
    vi.mocked(fetch).mockResolvedValue(
      response(false, { code: "INVALID_EMAIL_OR_PASSWORD" }),
    );
    const user = userEvent.setup();
    render(<AuthForm mode="signin" />);
    await credentials(user);
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "E-mail ou senha inválidos",
    );
    expect(screen.getByLabelText("E-mail", { exact: true })).toHaveValue(
      "teste@precopronto.test",
    );
    expect(routing.replace).not.toHaveBeenCalled();
  });
  it("signIn_verifiedAccount_opensPrivateArea", async () => {
    vi.mocked(fetch).mockResolvedValue(response());
    const user = userEvent.setup();
    render(<AuthForm mode="signin" />);
    await credentials(user);
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(routing.replace).toHaveBeenCalledWith("/app"));
  });
  it("signUp_validData_keepsMarketingOptionalAndShowsGenericConfirmation", async () => {
    vi.mocked(fetch).mockResolvedValue(response());
    const user = userEvent.setup();
    render(<AuthForm mode="signup" />);
    await user.type(screen.getByLabelText("Seu nome"), "Teste");
    await credentials(user);
    await user.type(
      screen.getByLabelText("Confirme a senha"),
      "senha-de-teste-segura",
    );
    await user.click(screen.getByRole("checkbox", { name: /Li e aceito/ }));
    await user.click(
      screen.getByRole("button", { name: "Criar conta gratuita" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Confira seu e-mail" }),
    ).toBeInTheDocument();
    const sent = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(sent.termsAccepted).toBe(true);
    expect(sent.marketingConsent).toBe(false);
    expect(sent).not.toHaveProperty("termsVersion");
  });
  it("signUp_mismatchedPassword_preventsRequest", async () => {
    const user = userEvent.setup();
    render(<AuthForm mode="signup" />);
    await user.type(screen.getByLabelText("Seu nome"), "Teste");
    await credentials(user);
    await user.type(
      screen.getByLabelText("Confirme a senha"),
      "outra-senha-diferente",
    );
    await user.click(screen.getByRole("checkbox", { name: /Li e aceito/ }));
    await user.click(
      screen.getByRole("button", { name: "Criar conta gratuita" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("senhas não coincidem");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("requestReset_unknownEmail_showsGenericMessage", async () => {
    vi.mocked(fetch).mockResolvedValue(response());
    const user = userEvent.setup();
    render(<AuthForm mode="forgot" />);
    await user.type(
      screen.getByLabelText("E-mail", { exact: true }),
      "desconhecido@precopronto.test",
    );
    await user.click(
      screen.getByRole("button", { name: "Enviar link de recuperação" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Se existir uma conta",
    );
  });
  it("reset_missingToken_offersFreshLink", () => {
    render(<AuthForm mode="reset" />);
    expect(
      screen.getByRole("link", { name: "Recuperar acesso" }),
    ).toHaveAttribute("href", "/recuperar-senha");
    expect(screen.queryByLabelText("Nova senha")).not.toBeInTheDocument();
  });
  it("reset_usedToken_showsExpiredMessage", async () => {
    routing.query = "token=ficticio";
    vi.mocked(fetch).mockResolvedValue(
      response(false, { code: "INVALID_TOKEN" }),
    );
    const user = userEvent.setup();
    render(<AuthForm mode="reset" />);
    await user.type(
      screen.getByLabelText("Nova senha"),
      "senha-de-teste-segura",
    );
    await user.type(
      screen.getByLabelText("Confirme a senha"),
      "senha-de-teste-segura",
    );
    await user.click(screen.getByRole("button", { name: "Salvar nova senha" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "expirou ou já foi usado",
    );
  });
  it("verify_reusedLink_doesNotClaimSuccess", () => {
    routing.query = "verificado=1&error=INVALID_TOKEN";
    render(<AuthForm mode="signin" />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Se você já confirmou o e-mail, tente entrar",
    );
    expect(
      screen.queryByText("E-mail confirmado. Entre para continuar."),
    ).not.toBeInTheDocument();
  });
  it("resend_emptyEmail_doesNotSend", async () => {
    const user = userEvent.setup();
    render(<AuthForm mode="signin" />);
    await user.click(
      screen.getByRole("button", { name: "Reenviar confirmação do e-mail" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Informe seu e-mail");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("signIn_networkFailure_retainsFieldsForRetry", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    render(<AuthForm mode="signin" />);
    await credentials(user);
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail", { exact: true })).toHaveValue(
      "teste@precopronto.test",
    );
    expect(screen.getByRole("button", { name: "Entrar" })).toBeEnabled();
  });
});
