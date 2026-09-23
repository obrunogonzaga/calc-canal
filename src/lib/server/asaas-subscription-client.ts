/**
 * Server-only Asaas Sandbox client. It reads ASAAS_SANDBOX_API_KEY and must
 * never be imported by browser code.
 *
 * Official API references (accessed 2026-09-22):
 * https://docs.asaas.com/reference/list-payments
 * https://docs.asaas.com/reference/retrieve-a-single-subscription
 * https://docs.asaas.com/reference/remove-subscription
 * https://docs.asaas.com/reference/listing-and-pagination
 */

export const ASAAS_SANDBOX_API_BASE_URL = "https://api-sandbox.asaas.com/v3";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 5;
const MAX_PAGE_SIZE = 100;
const MAX_PAGES = 10;
const USER_AGENT = "PrecoPronto/0.1";

export type AsaasSubscriptionClientErrorCode =
  | "CONFIGURATION_ERROR"
  | "INVALID_INPUT"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "HTTP_ERROR"
  | "INVALID_RESPONSE"
  | "AMBIGUOUS_MATCH"
  | "SEARCH_LIMIT_REACHED";

export class AsaasSubscriptionClientError extends Error {
  readonly code: AsaasSubscriptionClientErrorCode;
  readonly status?: number;

  constructor(
    message: string,
    code: AsaasSubscriptionClientErrorCode,
    status?: number,
  ) {
    super(message);
    this.name = "AsaasSubscriptionClientError";
    this.code = code;
    this.status = status;
  }
}

export interface AsaasCheckoutPayment {
  subscriptionId?: string;
  paymentId: string;
  checkoutSession: string;
  paymentStatus?: string;
  value?: number;
  billingType?: string;
  dueDate?: string;
}

export interface AsaasSubscriptionPayment extends AsaasCheckoutPayment {
  subscriptionId: string;
}

export interface AsaasSubscriptionDetails {
  id: string;
  value?: number;
  cycle?: string;
  billingType?: string;
  status?: string;
  nextDueDate?: string;
  deleted?: boolean;
}

export interface AsaasSubscriptionCancellation {
  id: string;
  cancelled: true;
}

export interface AsaasSandboxSubscriptionClientOptions {
  env?: Readonly<Record<string, string | undefined>>;
  fetch?: typeof fetch;
  timeoutMs?: number;
  pageSize?: number;
  maxPages?: number;
}

export interface AsaasSandboxSubscriptionClient {
  /**
   * Resolves a recurring subscription only from an exact checkoutSession
   * value present on a payment. It never correlates by amount, date, or
   * customer.
   */
  findSubscriptionByCheckoutSession(
    checkoutSession: string,
  ): Promise<AsaasSubscriptionPayment | undefined>;
  findCheckoutPaymentBySession(checkoutSession: string): Promise<AsaasCheckoutPayment | undefined>;
  findInitialPaymentBySubscription(subscriptionId: string): Promise<AsaasSubscriptionPayment | undefined>;
  getSubscription(subscriptionId: string): Promise<AsaasSubscriptionDetails>;
  isSubscriptionDeleted(subscriptionId: string): Promise<boolean>;
  cancelSubscription(
    subscriptionId: string,
  ): Promise<AsaasSubscriptionCancellation>;
}

interface AsaasListPage {
  data: unknown[];
  hasMore: boolean;
}

interface PaymentScan {
  matches: AsaasCheckoutPayment[];
  reachedLimit: boolean;
}

function configurationError(message: string): AsaasSubscriptionClientError {
  return new AsaasSubscriptionClientError(message, "CONFIGURATION_ERROR");
}

function inputError(message: string): AsaasSubscriptionClientError {
  return new AsaasSubscriptionClientError(message, "INVALID_INPUT");
}

function invalidResponse(): AsaasSubscriptionClientError {
  return new AsaasSubscriptionClientError(
    "A resposta do Asaas Sandbox é inválida.",
    "INVALID_RESPONSE",
  );
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

function ensurePositiveInteger(
  value: number,
  name: string,
  maximum?: number,
): number {
  if (
    !Number.isInteger(value) ||
    value < 1 ||
    (maximum !== undefined && value > maximum)
  ) {
    const range = maximum === undefined ? "um inteiro positivo" : `entre 1 e ${maximum}`;
    throw configurationError(`${name} deve ser ${range}.`);
  }

  return value;
}

function isSafeIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 200 &&
    value === value.trim() &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function validateCheckoutSession(value: string): string {
  if (!isSafeIdentifier(value)) {
    throw inputError("checkoutSession deve ser um identificador válido.");
  }

  return value;
}

function isSubscriptionId(value: unknown): value is string {
  return isSafeIdentifier(value) && /^sub_[A-Za-z0-9_-]+$/.test(value);
}

function validateSubscriptionId(value: string): string {
  if (!isSubscriptionId(value)) {
    throw inputError("subscriptionId deve ser um identificador de assinatura válido.");
  }

  return value;
}

function readOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !value.trim() || value.length > 200) {
    throw invalidResponse();
  }

  return value;
}

function readOptionalValue(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw invalidResponse();
  }

  return value;
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") throw invalidResponse();
  return value;
}

function readListPage(value: unknown): AsaasListPage {
  if (!value || typeof value !== "object") throw invalidResponse();

  const page = value as Record<string, unknown>;
  if (!Array.isArray(page.data)) throw invalidResponse();
  if (page.hasMore !== undefined && typeof page.hasMore !== "boolean") {
    throw invalidResponse();
  }

  return {
    data: page.data,
    hasMore: page.hasMore === true,
  };
}

function readPaymentMatch(
  value: unknown,
  checkoutSession: string,
): AsaasCheckoutPayment | undefined {
  if (!value || typeof value !== "object") return undefined;

  const payment = value as Record<string, unknown>;
  if (payment.checkoutSession !== checkoutSession) return undefined;

  if (!isSafeIdentifier(payment.id) ||
    (payment.subscription != null && !isSubscriptionId(payment.subscription))) {
    throw invalidResponse();
  }

  return {
    ...(typeof payment.subscription === "string" ? { subscriptionId: payment.subscription } : {}),
    paymentId: payment.id,
    checkoutSession,
    ...(readOptionalString(payment.status) !== undefined
      ? { paymentStatus: readOptionalString(payment.status) }
      : {}),
    ...(readOptionalValue(payment.value) !== undefined
      ? { value: readOptionalValue(payment.value) }
      : {}),
    ...(readOptionalString(payment.billingType) !== undefined
      ? { billingType: readOptionalString(payment.billingType) }
      : {}),
    ...(readOptionalString(payment.dueDate) !== undefined
      ? { dueDate: readOptionalString(payment.dueDate) }
      : {}),
  };
}

function samePayment(
  left: AsaasCheckoutPayment,
  right: AsaasCheckoutPayment,
): boolean {
  return (
    left.subscriptionId === right.subscriptionId &&
    left.paymentId === right.paymentId &&
    left.checkoutSession === right.checkoutSession &&
    left.paymentStatus === right.paymentStatus &&
    left.value === right.value &&
    left.billingType === right.billingType &&
    left.dueDate === right.dueDate
  );
}

function selectSinglePayment(
  matches: readonly AsaasCheckoutPayment[],
): AsaasCheckoutPayment | undefined {
  const unique = new Map<string, AsaasCheckoutPayment>();

  for (const match of matches) {
    const previous = unique.get(match.paymentId);
    if (previous && !samePayment(previous, match)) {
      throw new AsaasSubscriptionClientError(
        "A conciliação encontrou cobranças ambíguas para o checkout.",
        "AMBIGUOUS_MATCH",
      );
    }
    unique.set(match.paymentId, match);
  }

  if (unique.size === 0) return undefined;
  if (unique.size !== 1) {
    throw new AsaasSubscriptionClientError(
      "A conciliação encontrou cobranças ambíguas para o checkout.",
      "AMBIGUOUS_MATCH",
    );
  }

  return unique.values().next().value;
}

function paymentListUrl(
  checkoutSession: string | undefined,
  limit: number,
  offset: number,
): string {
  const url = new URL(`${ASAAS_SANDBOX_API_BASE_URL}/payments`);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  if (checkoutSession !== undefined) {
    url.searchParams.set("checkoutSession", checkoutSession);
  }
  return url.toString();
}

function subscriptionUrl(subscriptionId: string): string {
  return `${ASAAS_SANDBOX_API_BASE_URL}/subscriptions/${encodeURIComponent(subscriptionId)}`;
}

export function createAsaasSandboxSubscriptionClient(
  options: AsaasSandboxSubscriptionClientOptions = {},
): AsaasSandboxSubscriptionClient {
  const env = options.env ?? process.env;
  const apiKey = readSandboxApiKey(env);
  const requestFetch = options.fetch ?? fetch;
  const timeoutMs = ensurePositiveInteger(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, "timeoutMs");
  const pageSize = ensurePositiveInteger(
    options.pageSize ?? DEFAULT_PAGE_SIZE,
    "pageSize",
    MAX_PAGE_SIZE,
  );
  const maxPages = ensurePositiveInteger(
    options.maxPages ?? DEFAULT_MAX_PAGES,
    "maxPages",
    MAX_PAGES,
  );

  async function request(
    url: string,
    method: "GET" | "DELETE",
    readJson: boolean,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let response: Response;

      try {
        response = await requestFetch(url, {
          method,
          headers: {
            Accept: "application/json",
            "User-Agent": USER_AGENT,
            access_token: apiKey,
          },
          signal: controller.signal,
        });
      } catch {
        if (controller.signal.aborted) {
          throw new AsaasSubscriptionClientError(
            "A requisição ao Asaas Sandbox excedeu o tempo limite.",
            "TIMEOUT",
          );
        }

        throw new AsaasSubscriptionClientError(
          "Não foi possível conectar ao Asaas Sandbox.",
          "NETWORK_ERROR",
        );
      }

      if (!response.ok) {
        throw new AsaasSubscriptionClientError(
          "O Asaas Sandbox recusou a requisição.",
          "HTTP_ERROR",
          response.status,
        );
      }

      if (!readJson) return undefined;

      try {
        return await response.json();
      } catch {
        throw invalidResponse();
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  async function scanPayments(
    checkoutSession: string,
    remoteFilter: boolean,
  ): Promise<PaymentScan> {
    const matches: AsaasCheckoutPayment[] = [];

    for (let page = 0; page < maxPages; page += 1) {
      const body = await request(
        paymentListUrl(
          remoteFilter ? checkoutSession : undefined,
          pageSize,
          page * pageSize,
        ),
        "GET",
        true,
      );
      const result = readListPage(body);

      for (const payment of result.data) {
        const match = readPaymentMatch(payment, checkoutSession);
        if (match) matches.push(match);
      }

      if (!result.hasMore) return { matches, reachedLimit: false };
    }

    return { matches, reachedLimit: true };
  }

  async function scanInitialPayments(
    subscriptionId: string,
    remoteFilter: boolean,
  ): Promise<PaymentScan> {
    const matches: AsaasCheckoutPayment[] = [];
    for (let page = 0; page < maxPages; page += 1) {
      const url = new URL(`${ASAAS_SANDBOX_API_BASE_URL}/payments`);
      url.searchParams.set("limit", String(pageSize));
      url.searchParams.set("offset", String(page * pageSize));
      if (remoteFilter) url.searchParams.set("subscription", subscriptionId);
      const result = readListPage(await request(url.toString(), "GET", true));
      for (const raw of result.data) {
        if (!raw || typeof raw !== "object") continue;
        const payment = raw as Record<string, unknown>;
        if (payment.subscription !== subscriptionId || !isSafeIdentifier(payment.checkoutSession)) continue;
        const match = readPaymentMatch(payment, payment.checkoutSession);
        if (match) matches.push(match);
      }
      if (!result.hasMore) return { matches, reachedLimit: false };
    }
    return { matches, reachedLimit: true };
  }

  async function findCheckoutPaymentBySession(input: string): Promise<AsaasCheckoutPayment | undefined> {
      const checkoutSession = validateCheckoutSession(input);

      // The Asaas checkoutSession filter is used as an optimization, then an
      // unfiltered bounded scan compensates for a documented Sandbox
      // false-negative observed during checkout reconciliation.
      const filtered = await scanPayments(checkoutSession, true);
      const filteredMatch = selectSinglePayment(filtered.matches);
      if (filteredMatch && !filtered.reachedLimit) return filteredMatch;

      const fallback = await scanPayments(checkoutSession, false);
      if (fallback.reachedLimit) {
        throw new AsaasSubscriptionClientError(
          "A conciliação atingiu o limite de páginas antes de concluir a busca.",
          "SEARCH_LIMIT_REACHED",
        );
      }

      return selectSinglePayment(fallback.matches);
  }

  return {
    async findCheckoutPaymentBySession(input) {
      return findCheckoutPaymentBySession(input);
    },
    async findSubscriptionByCheckoutSession(input) {
      const match = await findCheckoutPaymentBySession(input);
      if (!match) return undefined;
      if (!match.subscriptionId) throw invalidResponse();
      return { ...match, subscriptionId: match.subscriptionId };
    },
    async findInitialPaymentBySubscription(input) {
      const subscriptionId = validateSubscriptionId(input);
      const filtered = await scanInitialPayments(subscriptionId, true);
      const filteredMatch = selectSinglePayment(filtered.matches);
      if (filteredMatch && !filtered.reachedLimit) {
        return { ...filteredMatch, subscriptionId };
      }
      const fallback = await scanInitialPayments(subscriptionId, false);
      if (fallback.reachedLimit) {
        throw new AsaasSubscriptionClientError(
          "A busca pela primeira cobrança atingiu o limite de páginas.",
          "SEARCH_LIMIT_REACHED",
        );
      }
      const match = selectSinglePayment(fallback.matches);
      return match ? { ...match, subscriptionId } : undefined;
    },

    async getSubscription(input) {
      const subscriptionId = validateSubscriptionId(input);
      const body = await request(subscriptionUrl(subscriptionId), "GET", true);

      if (!body || typeof body !== "object") throw invalidResponse();
      const subscription = body as Record<string, unknown>;
      if (subscription.id !== subscriptionId) throw invalidResponse();

      return {
        id: subscriptionId,
        ...(readOptionalValue(subscription.value) !== undefined
          ? { value: readOptionalValue(subscription.value) }
          : {}),
        ...(readOptionalString(subscription.cycle) !== undefined
          ? { cycle: readOptionalString(subscription.cycle) }
          : {}),
        ...(readOptionalString(subscription.billingType) !== undefined
          ? { billingType: readOptionalString(subscription.billingType) }
          : {}),
        ...(readOptionalString(subscription.status) !== undefined
          ? { status: readOptionalString(subscription.status) }
          : {}),
        ...(readOptionalString(subscription.nextDueDate) !== undefined
          ? { nextDueDate: readOptionalString(subscription.nextDueDate) }
          : {}),
        ...(readOptionalBoolean(subscription.deleted) !== undefined
          ? { deleted: readOptionalBoolean(subscription.deleted) }
          : {}),
      };
    },

    async isSubscriptionDeleted(input) {
      const subscriptionId = validateSubscriptionId(input);
      for (let page = 0; page < maxPages; page += 1) {
        const url = new URL(`${ASAAS_SANDBOX_API_BASE_URL}/subscriptions`);
        url.searchParams.set("deletedOnly", "true");
        url.searchParams.set("limit", String(pageSize));
        url.searchParams.set("offset", String(page * pageSize));
        const result = readListPage(await request(url.toString(), "GET", true));
        for (const raw of result.data) {
          if (!raw || typeof raw !== "object") throw invalidResponse();
          const item = raw as Record<string, unknown>;
          if (item.id === subscriptionId) {
            return item.deleted !== false;
          }
        }
        if (!result.hasMore) return false;
      }
      throw new AsaasSubscriptionClientError(
        "A consulta de assinaturas excluídas atingiu o limite de páginas.",
        "SEARCH_LIMIT_REACHED",
      );
    },

    async cancelSubscription(input) {
      const subscriptionId = validateSubscriptionId(input);
      await request(subscriptionUrl(subscriptionId), "DELETE", false);
      return { id: subscriptionId, cancelled: true };
    },
  };
}
