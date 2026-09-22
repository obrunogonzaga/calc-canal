import { PRO_MONTHLY_AMOUNT_BRL } from "@/lib/billing-plan";

export const ASAAS_SANDBOX_API_BASE_URL = "https://api-sandbox.asaas.com/v3";
export const ASAAS_SANDBOX_CHECKOUT_BASE_URL =
  "https://sandbox.asaas.com/checkoutSession/show";
export const PRECO_PRONTO_PRO_VALUE = PRO_MONTHLY_AMOUNT_BRL;

const DEFAULT_TIMEOUT_MS = 10_000;
const USER_AGENT = "PrecoPronto/0.1";

export interface CheckoutCallbacks {
  successUrl: string;
  cancelUrl: string;
  expiredUrl: string;
}

export interface CheckoutCustomerData {
  name: string;
  email: string;
  cpfCnpj?: string;
  phone?: string;
}

export interface CheckoutCustomerInput {
  customer?: string;
  customerData?: CheckoutCustomerData;
}

export interface RecurringCardCheckoutInput extends CheckoutCustomerInput {
  externalReference: string;
  callbacks: CheckoutCallbacks;
  nextDueDate: string;
  endDate?: string;
}

export interface PixCheckoutInput extends CheckoutCustomerInput {
  externalReference: string;
  callbacks: CheckoutCallbacks;
  minutesToExpire?: number;
}

export interface AsaasCheckoutResult {
  id: string;
  link: string;
  status: string;
  externalReference: string;
}

export type AsaasClientErrorCode =
  | "CONFIGURATION_ERROR"
  | "INVALID_INPUT"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "HTTP_ERROR"
  | "INVALID_RESPONSE";

export class AsaasClientError extends Error {
  readonly code: AsaasClientErrorCode;
  readonly status?: number;

  constructor(
    message: string,
    code: AsaasClientErrorCode,
    status?: number,
  ) {
    super(message);
    this.name = "AsaasClientError";
    this.code = code;
    this.status = status;
  }
}

export interface AsaasSandboxClientOptions {
  env?: Readonly<Record<string, string | undefined>>;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export interface AsaasSandboxClient {
  createRecurringCardCheckout(
    input: RecurringCardCheckoutInput,
  ): Promise<AsaasCheckoutResult>;
  createPixCheckout(input: PixCheckoutInput): Promise<AsaasCheckoutResult>;
}

function configurationError(message: string): AsaasClientError {
  return new AsaasClientError(message, "CONFIGURATION_ERROR");
}

function inputError(message: string): AsaasClientError {
  return new AsaasClientError(message, "INVALID_INPUT");
}

function readSandboxApiKey(
  env: Readonly<Record<string, string | undefined>>,
): string {
  if (env.ASAAS_ENV !== "sandbox") {
    throw configurationError("ASAAS_ENV deve ser exatamente sandbox.");
  }

  const apiKey = env.ASAAS_SANDBOX_API_KEY;
  if (!apiKey) {
    throw configurationError(
      "ASAAS_SANDBOX_API_KEY é obrigatória para o Sandbox.",
    );
  }

  if (apiKey.startsWith("$aact_prod_") || !apiKey.startsWith("$aact_hmlg_")) {
    throw configurationError("A chave configurada não é uma chave de Sandbox.");
  }

  return apiKey;
}

function validateExternalReference(value: string): void {
  if (typeof value !== "string" || !value.trim() || value.length > 200) {
    throw inputError("externalReference deve ter entre 1 e 200 caracteres.");
  }
}
function validateDate(value: string, label: string): void {
  const timestamp =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? Date.parse(`${value}T12:00:00Z`)
      : NaN;
  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== value
  )
    throw inputError(`${label} deve ser uma data válida no formato AAAA-MM-DD.`);
}

function validateCallbackUrl(name: string, value: string): void {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
  } catch {
    throw inputError(`${name} deve ser uma URL HTTP(S) absoluta.`);
  }
}

function validateCallbacks(callbacks: CheckoutCallbacks): void {
  validateCallbackUrl("successUrl", callbacks.successUrl);
  validateCallbackUrl("cancelUrl", callbacks.cancelUrl);
  validateCallbackUrl("expiredUrl", callbacks.expiredUrl);
}

function addCustomer(
  payload: Record<string, unknown>,
  input: CheckoutCustomerInput,
): void {
  if (input.customer !== undefined && input.customerData !== undefined) {
    throw inputError("Informe customer ou customerData, não os dois.");
  }

  if (input.customer !== undefined) {
    if (!input.customer.trim()) {
      throw inputError("customer não pode ser vazio.");
    }
    payload.customer = input.customer;
  }
  if (input.customerData) payload.customerData = input.customerData;
}

function checkoutLink(id: string): string {
  return `${ASAAS_SANDBOX_CHECKOUT_BASE_URL}/${encodeURIComponent(id)}`;
}

function safeCheckoutLink(value: unknown, id: string): string {
  if (value === undefined || value === null) return checkoutLink(id);
  if (typeof value !== "string")
    throw new AsaasClientError("Link de Checkout inválido.", "INVALID_RESPONSE");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AsaasClientError("Link de Checkout inválido.", "INVALID_RESPONSE");
  }
  const pathMatches =
    url.pathname === `/checkoutSession/show/${encodeURIComponent(id)}` ||
    (url.pathname === "/checkoutSession/show" && url.searchParams.get("id") === id);
  if (
    url.origin !== "https://sandbox.asaas.com" ||
    url.username ||
    url.password ||
    url.hash ||
    !pathMatches
  )
    throw new AsaasClientError("Link de Checkout inválido.", "INVALID_RESPONSE");
  return url.toString();
}

function readCheckoutResult(
  value: unknown,
  requestedExternalReference: string,
): AsaasCheckoutResult {
  if (!value || typeof value !== "object") {
    throw new AsaasClientError(
      "A resposta do Checkout do Asaas é inválida.",
      "INVALID_RESPONSE",
    );
  }

  const response = value as Record<string, unknown>;
  const id = typeof response.id === "string" ? response.id.trim() : "";
  const status =
    response.status === undefined
      ? "CREATED"
      : typeof response.status === "string"
        ? response.status.trim()
        : "";
  const returnedExternalReference =
    typeof response.externalReference === "string"
      ? response.externalReference
      : undefined;

  if (
    !id ||
    !status ||
    id.length > 200 ||
    /[\u0000-\u001f\u007f]/.test(id) ||
    (returnedExternalReference !== undefined &&
      returnedExternalReference !== requestedExternalReference)
  ) {
    throw new AsaasClientError(
      "A resposta do Checkout do Asaas não contém id/status válidos.",
      "INVALID_RESPONSE",
    );
  }

  return {
    id,
    link: safeCheckoutLink(response.link, id),
    status,
    externalReference: returnedExternalReference ?? requestedExternalReference,
  };
}

function ensureTimeout(timeoutMs: number): number {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw configurationError("timeoutMs deve ser um inteiro positivo.");
  }
  return timeoutMs;
}

export function createAsaasSandboxClient(
  options: AsaasSandboxClientOptions = {},
): AsaasSandboxClient {
  const env = options.env ?? process.env;
  const apiKey = readSandboxApiKey(env);
  const requestFetch = options.fetch ?? fetch;
  const timeoutMs = ensureTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  async function createCheckout(
    payload: Record<string, unknown>,
    externalReference: string,
  ): Promise<AsaasCheckoutResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let response: Response;

      try {
        response = await requestFetch(`${ASAAS_SANDBOX_API_BASE_URL}/checkouts`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
            access_token: apiKey,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } catch {
        if (controller.signal.aborted) {
          throw new AsaasClientError(
            "A requisição ao Asaas Sandbox excedeu o tempo limite.",
            "TIMEOUT",
          );
        }

        throw new AsaasClientError(
          "Não foi possível conectar ao Asaas Sandbox.",
          "NETWORK_ERROR",
        );
      }

      if (!response.ok) {
        throw new AsaasClientError(
          "O Asaas Sandbox recusou a criação do Checkout.",
          "HTTP_ERROR",
          response.status,
        );
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new AsaasClientError(
          "A resposta do Checkout do Asaas não é JSON válido.",
          "INVALID_RESPONSE",
          response.status,
        );
      }

      return readCheckoutResult(body, externalReference);
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    async createRecurringCardCheckout(input) {
      validateExternalReference(input.externalReference);
      validateCallbacks(input.callbacks);
      validateDate(input.nextDueDate, "nextDueDate");
      if (input.endDate) validateDate(input.endDate, "endDate");

      const payload: Record<string, unknown> = {
        billingTypes: ["CREDIT_CARD"],
        chargeTypes: ["RECURRENT"],
        minutesToExpire: 60,
        externalReference: input.externalReference,
        callback: input.callbacks,
        items: [
          {
            name: "PreçoPronto PRO",
            quantity: 1,
            value: PRECO_PRONTO_PRO_VALUE,
          },
        ],
        subscription: {
          cycle: "MONTHLY",
          nextDueDate: input.nextDueDate,
          ...(input.endDate ? { endDate: input.endDate } : {}),
        },
      };
      addCustomer(payload, input);
      return createCheckout(payload, input.externalReference);
    },

    async createPixCheckout(input) {
      validateExternalReference(input.externalReference);
      validateCallbacks(input.callbacks);
      const minutesToExpire = input.minutesToExpire ?? 60;
      if (
        !Number.isInteger(minutesToExpire) ||
        minutesToExpire < 10 ||
        minutesToExpire > 1440
      ) {
        throw inputError("minutesToExpire deve estar entre 10 e 1440.");
      }

      const payload: Record<string, unknown> = {
        billingTypes: ["PIX"],
        chargeTypes: ["DETACHED"],
        minutesToExpire,
        externalReference: input.externalReference,
        callback: input.callbacks,
        items: [
          {
            name: "PreçoPronto PRO — 1 mês",
            quantity: 1,
            value: PRECO_PRONTO_PRO_VALUE,
          },
        ],
      };
      addCustomer(payload, input);
      return createCheckout(payload, input.externalReference);
    },
  };
}
