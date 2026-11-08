import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { absoluteUrl } from "@/lib/urls";

export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection(); // per request: the URL comes from the runtime APP_URL, not the build
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Private, per-person or not useful in search results.
      disallow: [
        "/dashboard",
        "/onboarding",
        "/sign-in",
        "/api/",
        "/unsubscribe/",
        "/embed/",
        "/subscription-invalid",
        "/*/subscribed",
        "/*/check-inbox",
      ],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
