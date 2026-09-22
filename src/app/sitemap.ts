import type { MetadataRoute } from "next";
import { getSiteOrigin } from "@/lib/site";
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getSiteOrigin();
  return origin
    ? ["", "/ajuda", "/privacidade", "/termos"].map((path) => ({
        url: origin + path,
      }))
    : [];
}
