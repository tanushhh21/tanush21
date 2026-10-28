import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  // The console, the API and candidates' private reply pages are never indexed.
  return { rules: { userAgent: "*", allow: "/", disallow: ["/console", "/api", "/r/"] }, sitemap: `${SITE_URL}/sitemap.xml`, host: SITE_URL };
}
