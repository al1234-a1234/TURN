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
  branches: {
    id: string; city: string | null; lat: number | null; lng: number | null; is_active: boolean;
    branch_settings:
      | { accepts_waitlist: boolean; manually_closed: boolean; busy_now: boolean; opening_hours: { open?: string; close?: string } | null }
      | { accepts_waitlist: boolean; manually_closed: boolean; busy_now: boolean; opening_hours: { open?: string; close?: string } | null }[]
      | null;
  }[];
};

/**
 * قائمة الاكتشاف + متوسط التقييمات — مكاشة ٣٠ ثانية.
 * تُقلّل ضرب القاعدة لمرة كل ٣٠ث مهما زاد عدد الزوّار (عدّاد الطوابير يبقى حيًّا خارج الكاش).
 */
export const getDiscovery = unstable_cache(
  async (): Promise<{
    list: DiscoveryRestaurant[];
    ratings: Record<string, { sum: number; n: number }>;
  }> => {
    const sb = anon();
    const { data: restaurants } = await sb
      .from("restaurants")
      .select("id, name, slug, logo_url, cover_url, cuisine, cuisine_en, branches(id, city, lat, lng, is_active, branch_settings(accepts_waitlist, manually_closed, busy_now, opening_hours))")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(60);

    const list = ((restaurants ?? []) as DiscoveryRestaurant[])
      .map((r) => ({ ...r, branches: (r.branches ?? []).filter((b) => b.is_active) }))
      .filter((r) => r.branches.length > 0);

    const ratings: Record<string, { sum: number; n: number }> = {};
    if (list.length) {
      const ids = list.map((r) => r.id);
      const { data: reviewRows } = await sb
        .from("reviews").select("restaurant_id, rating").eq("is_published", true).in("restaurant_id", ids);
      for (const rr of reviewRows ?? []) {
        const a = ratings[rr.restaurant_id] ?? { sum: 0, n: 0 };
        a.sum += rr.rating; a.n += 1;
        ratings[rr.restaurant_id] = a;
      }
    }
    return { list, ratings };
  },
  ["discovery-v5"],
  { revalidate: 30, tags: ["discovery"] },
);


/**
 * عدّادات الطوابير للرئيسية — كاش ١٠ثوانٍ.
 * الرئيسية أعلى الصفحات زيارةً؛ بدون الكاش كل زيارة تستدعي القاعدة حيًّا.
 * تقادمُ ١٠ثوانٍ مقبول لعدّادٍ استكشافي — الدقّة اللحظية في صفحة المطعم والتذكرة.
 */
export const getHomeQueueCounts = unstable_cache(
  async (ids: string[]) => {
    if (!ids.length) return [] as { branch_id: string; total: number; inside: number; outside: number }[];
    const { data } = await anon().rpc("waitlist_counts_for", { p_branch_ids: ids });
    return (data ?? []) as { branch_id: string; total: number; inside: number; outside: number }[];
  },
  ["home-queue-counts"],
  { revalidate: 10, tags: ["discovery"] },
);

/**
 * محتوى فرعٍ ثابت (قائمة + صور المعرض) — كاش ٦٠ث.
 * هذه أثقل ما تحمله صفحة المطعم وأكثره سكونًا: لا تتغيّر إلا حين يعدّل المالك
 * قائمته أو صوره. كانت تُجلب حيًّا في كل مسح باركود (المسحات ≫ الانضمامات) —
 * فمع ٥٠ مطعمًا صار المسار الحرج يعيد جلبها آلاف المرّات يوميًّا بلا داعٍ.
 * الكاش يجعلها إعادة‑جلبٍ واحدة كل ٦٠ث لكل فرع مهما بلغ عدد الماسحين.
 */
export const getBranchContent = unstable_cache(
  async (branchId: string) => {
    const sb = anon();
    const [{ data: categories }, { data: items }, { data: photos }] = await Promise.all([
      sb.from("menu_categories").select("id, name").eq("branch_id", branchId).order("sort_order").order("created_at"),
      sb.from("menu_items").select("id, name, price, description, image_url, category_id").eq("branch_id", branchId).eq("is_available", true).order("created_at"),
      sb.from("restaurant_photos").select("id, url, caption").eq("branch_id", branchId).order("sort_order").order("created_at"),
    ]);
    return {
      categories: (categories ?? []) as { id: string; name: string }[],
      items: (items ?? []) as { id: string; name: string; price: number | null; description: string | null; image_url: string | null; category_id: string }[],
      photos: (photos ?? []) as { id: string; url: string; caption: string | null }[],
    };
  },
  ["branch-content-v1"],
  { revalidate: 60, tags: ["discovery"] },
);

/**
 * صورة الغلاف لكل فرع (شريط الفروع) — كاش ٦٠ث. تُجلب لكل فروع المطعم دفعةً.
 */
export const getBranchStripPhotos = unstable_cache(
  async (branchIds: string[]) => {
    if (!branchIds.length) return {} as Record<string, string>;
    const { data } = await anon()
      .from("restaurant_photos").select("url, branch_id")
      .in("branch_id", branchIds).order("sort_order").order("created_at");
    const map: Record<string, string> = {};
    for (const ph of data ?? []) if (!(ph.branch_id in map)) map[ph.branch_id] = ph.url;
    return map;
  },
  ["branch-strip-photos-v1"],
  { revalidate: 60, tags: ["discovery"] },
);

/**
 * ملخّص تقييمات المطعم (متوسّط + عدد + توزيع النجوم + أحدث ٣٠) — كاش ٦٠ث.
 * كان كل مسحٍ يسحب ٢٠٠ صفًّا مع ضمّ جدول العملاء لحساب متوسّطٍ ورسم ٣٠ — أثقل
 * حمولةٍ في المسار. الآن مرّة كل ٦٠ث لكل مطعم. التنسيق حسب اللغة يبقى في الصفحة
 * كي يظلّ الكاش محايدًا للّغة (created_at خام، والاسم خام مع بديلٍ في الصفحة).
 */
export const getRestaurantReviews = unstable_cache(
  async (restaurantId: string) => {
    const { data } = await anon()
      .from("reviews").select("rating, comment, created_at, customers(full_name)")
      .eq("restaurant_id", restaurantId).eq("is_published", true)
      .order("created_at", { ascending: false }).limit(200);
    const rows = (data ?? []) as { rating: number; comment: string | null; created_at: string; customers: { full_name: string } | { full_name: string }[] | null }[];
    const count = rows.length;
    const avg = count ? Math.round((rows.reduce((a, r) => a + r.rating, 0) / count) * 10) / 10 : 0;
    const dist = [5, 4, 3, 2, 1].map((s) => ({ s, pct: count ? Math.round((rows.filter((r) => r.rating === s).length / count) * 100) : 0 }));
    const list = rows.slice(0, 30).map((r) => {
      const c = Array.isArray(r.customers) ? r.customers[0] : r.customers;
      return { name: c?.full_name?.trim() || null, stars: r.rating, created_at: r.created_at, text: r.comment ?? "" };
    });
    return { count, avg, dist, list };
  },
  ["restaurant-reviews-v1"],
  { revalidate: 60, tags: ["discovery"] },
);

/**
 * تعريف المطعم لمعاينة المشاركة — كاش ٥ دقائق.
 * generateMetadata يسبق بثّ أي بكسل، وكان يستعلم القاعدة حيًّا في كل فتحة
 * لصفحة أي مطعم — رحلة كاملة تحجب الرأس لبياناتٍ لا تتغيّر إلا حين يعدّل
 * المالك اسمه أو شعاره. خمس دقائق تقادمٍ في معاينة واتساب لا يلحظها أحد،
 * وحذفُ رحلةٍ من المسار الحرج يلحظه كل عميل.
 */
export const getRestaurantMeta = unstable_cache(
  async (slug: string) => {
    const { data } = await anon()
      .from("restaurants")
      .select("name, cuisine, logo_url, cover_url")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();
    return data;
  },
  ["restaurant-meta-v1"],
  { revalidate: 300, tags: ["discovery"] },
);
