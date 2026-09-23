export const siteName = "Líquido";
export const supportUrl =
  "mailto:bruno@aifbr.com.br";

// A preview must not claim a domain that has not been configured by its owner.
export function getSiteOrigin(): string | undefined {
  const value = process.env.NEXT_PUBLIC_SITE_URL;
  if (!value) return undefined;
  const url = new URL(value);
  if (url.protocol !== "https:")
    throw new Error("NEXT_PUBLIC_SITE_URL deve usar HTTPS.");
  return url.origin;
}
