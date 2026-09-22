import type { MetadataRoute } from "next";
import { getSiteOrigin } from "@/lib/site";
export default function robots(): MetadataRoute.Robots {
  const origin = getSiteOrigin();
  return origin
    ? {
        rules: {
          userAgent: "*",
          allow: "/",
          disallow: ["/app/", "/conta/", "/api/"],
        },
        sitemap: `${origin}/sitemap.xml`,
      }
    : { rules: { userAgent: "*", disallow: "/" } };
}
