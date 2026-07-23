import "server-only";
import { unstable_cache } from "next/cache";
import { createClient as createSbClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * عميل قراءة عام بلا كوكيز (anon) — للاستعلامات العامّة القابلة للكاش.
 * يحترم RLS (قراءة المطاعم الفعّالة والتقييمات المنشورة عامّة)، بلا أي سياق طلب.
 */
function anon() {
  return createSbClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export type DiscoveryRestaurant = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  cover_url: string | null;
  cuisine: string | null;
  cuisine_en: string | null;
  branches: { id: string; city: string | null; is_active: boolean; branch_settings: { accepts_waitlist: boolean } | { accepts_waitlist: boolean }[] | null }[];
};

/**
 * قائمة الاكتشاف + متوسط التقييمات — مكاشة ٣٠ ثانية.
 * تُقلّل ضرب القاعدة لمرة كل ٣٠ث مهما زاد عدد الزوّار (عدّاد الطوابير يبقى حيًّا خارج الكاش).
 */
export const getDiscovery = unstable_cache(
  async (): Promise<{ list: DiscoveryRestaurant[]; ratings: Record<string, { sum: number; n: number }> }> => {
    const sb = anon();
    const { data: restaurants } = await sb
      .from("restaurants")
      .select("id, name, slug, logo_url, cover_url, cuisine, cuisine_en, branches(id, city, is_active, branch_settings(accepts_waitlist))")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(60);

    const list = ((restaurants ?? []) as DiscoveryRestaurant[])
      .map((r) => ({ ...r, branches: (r.branches ?? []).filter((b) => b.is_active) }))
      .filter((r) => r.branches.length > 0);

    const ratings: Record<string, { sum: number; n: number }> = {};
    if (list.length) {
      const { data: reviewRows } = await sb
        .from("reviews")
        .select("restaurant_id, rating")
        .eq("is_published", true)
        .in("restaurant_id", list.map((r) => r.id));
      for (const rr of reviewRows ?? []) {
        const a = ratings[rr.restaurant_id] ?? { sum: 0, n: 0 };
        a.sum += rr.rating; a.n += 1;
        ratings[rr.restaurant_id] = a;
      }
    }
    return { list, ratings };
  },
  ["discovery-v1"],
  { revalidate: 30, tags: ["discovery"] },
);
