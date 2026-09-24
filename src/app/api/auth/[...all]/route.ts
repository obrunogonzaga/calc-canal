import {
  consumeOneTimeVerificationUrl,
  getAuth,
  getAuthBaseUrl,
  isAuthEnabled,
  isVerificationPathname,
  runWithEmailDeliveryBoundary,
} from "@/lib/server/auth";

export const runtime = "nodejs";

function isEmailVerificationRequest(request: Request): boolean {
  const url = new URL(request.url);

  return request.method === "GET" && isVerificationPathname(url.pathname);
}

function invalidVerificationResponse(request: Request): Response {
  const requestUrl = new URL(request.url);
  const callbackUrl = requestUrl.searchParams.get("callbackURL");

  if (!callbackUrl) {
    return new Response("Link de verificação inválido.", { status: 400 });
  }

  try {
    const authBaseUrl = new URL(getAuthBaseUrl());
    const redirectUrl = new URL(callbackUrl, authBaseUrl);

    if (redirectUrl.origin === authBaseUrl.origin) {
      redirectUrl.searchParams.delete("verificado");
      redirectUrl.searchParams.set("error", "INVALID_TOKEN");
      return Response.redirect(redirectUrl);
    }
  } catch {
    // A resposta abaixo evita redirecionar para uma origem não confiável.
  }

  return new Response("Link de verificação inválido.", { status: 400 });
}

async function handleAuthRequest(request: Request): Promise<Response> {
  if (!isAuthEnabled()) {
    return new Response(null, { status: 404 });
  }

  try {
    if (isEmailVerificationRequest(request)) {
      const url = new URL(request.url);
      const isUnusedToken = await consumeOneTimeVerificationUrl(
        url.searchParams.get("verificationId"),
        url.searchParams.get("token")
      );

      if (!isUnusedToken) {
        return invalidVerificationResponse(request);
      }
    }

    return await runWithEmailDeliveryBoundary(() => getAuth().handler(request));
  } catch {
    return new Response("A autenticação está temporariamente indisponível.", {
      status: 503,
    });
  }
}

export const GET = handleAuthRequest;
export const POST = handleAuthRequest;
export const PUT = handleAuthRequest;
export const PATCH = handleAuthRequest;
export const DELETE = handleAuthRequest;
