import { afterEach, describe, expect, it, vi } from "vitest";
import { getSiteOrigin } from "./site";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
afterEach(() => vi.unstubAllEnvs());
describe("site", () => {
  it("getSiteOrigin_unconfiguredPreview_keepsNoindexAndEmptySitemap", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(getSiteOrigin()).toBeUndefined();
    expect(sitemap()).toEqual([]);
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });
  it("getSiteOrigin_httpsOrigin_alignsRobotsAndSitemap", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com/");
    expect(getSiteOrigin()).toBe("https://example.com");
    expect(sitemap().map((p) => p.url)).toEqual([
      "https://example.com",
      "https://example.com/ajuda",
      "https://example.com/privacidade",
      "https://example.com/termos",
    ]);
    expect(robots().sitemap).toBe("https://example.com/sitemap.xml");
  });
  it("getSiteOrigin_insecureOrigin_rejectsConfiguration", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://example.com");
    expect(() => getSiteOrigin()).toThrow("HTTPS");
  });
});
