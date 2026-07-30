import type { MetadataRoute } from "next";

/* بلا robots كانت محركات البحث تفهرس لوحات الإدارة والتذاكر الشخصية.
   العام (الرئيسية وصفحات المطاعم) مسموح، والخاص محجوب. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/admin", "/reception", "/account", "/me", "/t/", "/tv/", "/api/"],
    },
    sitemap: "https://turn-alpha.vercel.app/sitemap.xml",
  };
}
