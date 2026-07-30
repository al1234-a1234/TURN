import type { MetadataRoute } from "next";
import { getDiscovery } from "@/lib/supabase/public-cache";

const BASE = "https://turn-alpha.vercel.app";

/* خريطة موقع حيّة: الرئيسية + صفحة كل مطعم فعّال — كل مطعم ينضم يصير
   قابلًا للعثور عليه في قوقل باسمه تلقائيًّا (قيمة تسويقية له بلا جهد). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { list } = await getDiscovery().catch(() => ({ list: [] as { slug: string }[] }));
  return [
    { url: BASE, changeFrequency: "hourly", priority: 1 },
    { url: `${BASE}/partners`, changeFrequency: "monthly", priority: 0.5 },
    ...list.map((r) => ({
      url: `${BASE}/r/${r.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}
