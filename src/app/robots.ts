import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/site";

/* بلا robots كانت محركات البحث تفهرس لوحات الإدارة والتذاكر الشخصية.
   العام (الرئيسية وصفحات المطاعم) مسموح، والخاص محجوب. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/admin", "/reception", "/account", "/me", "/t/", "/tv/", "/api/"],
    },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
