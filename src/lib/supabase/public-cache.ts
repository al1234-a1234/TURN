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
  branches: { id: string; city: string | null; lat: number | null; lng: number | null; is_active: boolean; branch_settings: { accepts_waitlist: boolean } | { accepts_waitlist: boolean }[] | null }[];
};

export type DiscoveryOffer = {
  id: string;
  title: string;
  kind: string;
  value: number | null;
  code: string | null;
  ends_at: string | null;
  restaurant: { name: string; slug: string; logo_url: string | null };
};

/**
 * قائمة الاكتشاف + متوسط التقييمات — مكاشة ٣٠ ثانية.
 * تُقلّل ضرب القاعدة لمرة كل ٣٠ث مهما زاد عدد الزوّار (عدّاد الطوابير يبقى حيًّا خارج الكاش).
 */
export const getDiscovery = unstable_cache(
  async (): Promise<{
    list: DiscoveryRestaurant[];
    ratings: Record<string, { sum: number; n: number }>;
    offers: DiscoveryOffer[];
  }> => {
    const sb = anon();
    const { data: restaurants } = await sb
      .from("restaurants")
      .select("id, name, slug, logo_url, cover_url, cuisine, cuisine_en, branches(id, city, lat, lng, is_active, branch_settings(accepts_waitlist))")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(60);

    const list = ((restaurants ?? []) as DiscoveryRestaurant[])
      .map((r) => ({ ...r, branches: (r.branches ?? []).filter((b) => b.is_active) }))
      .filter((r) => r.branches.length > 0);

    const ratings: Record<string, { sum: number; n: number }> = {};
    let offers: DiscoveryOffer[] = [];
    if (list.length) {
      const meta = new Map(list.map((r) => [r.id, { name: r.name, slug: r.slug, logo_url: r.logo_url }]));
      const ids = list.map((r) => r.id);

      const [{ data: reviewRows }, { data: offerRows }] = await Promise.all([
        sb.from("reviews").select("restaurant_id, rating").eq("is_published", true).in("restaurant_id", ids),
        sb
          .from("offers")
          .select("id, title, kind, value, code, ends_at, restaurant_id")
          .eq("is_active", true)
          .in("audience", ["all", "new"])
          .in("restaurant_id", ids)
          .order("created_at", { ascending: false })
          .limit(24),
      ]);

      for (const rr of reviewRows ?? []) {
        const a = ratings[rr.restaurant_id] ?? { sum: 0, n: 0 };
        a.sum += rr.rating; a.n += 1;
        ratings[rr.restaurant_id] = a;
      }

      const now = Date.now();
      offers = (offerRows ?? [])
        .filter((o) => !o.ends_at || new Date(o.ends_at).getTime() > now)
        .flatMap((o) => {
          const r = meta.get(o.restaurant_id);
          if (!r) return [];
          return [{
            id: o.id, title: o.title, kind: o.kind, value: o.value, code: o.code, ends_at: o.ends_at,
            restaurant: r,
          }];
        });
    }
    return { list, ratings, offers };
  },
  ["discovery-v2"],
  { revalidate: 30, tags: ["discovery"] },
);
