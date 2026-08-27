import "server-only";
import { unstable_cache } from "next/cache";
import { createClient as createSbClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * عميل قراءة عام بلا كوكيز (anon) — للاستعلامات العامّة القابلة للكاش.
 * يحترم RLS (قراءة المطاعم الفعّالة والتقييمات المنشورة عامّة)، بلا أي سياق طلب.
 */
export function publicRead() {
  return anon();
}

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
  /** تقييمٌ كتبه المالك بنفسه (0122) — يتقدّم على متوسط تقييمات المنصّة */
  manual_rating: number | null;
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
    const { data: restaurants, error } = await sb
      .from("restaurants")
      .select("id, name, slug, logo_url, cover_url, cuisine, cuisine_en, manual_rating, branches(id, city, lat, lng, is_active, branch_settings(accepts_waitlist, manually_closed, busy_now, opening_hours))")
      .eq("is_active", true)
      .eq("is_canary", false)
      .order("created_at", { ascending: false })
      .limit(60);

    // نرمي ولا نرجّع فراغًا: unstable_cache لا يخزّن نتيجة دالةٍ رمت استثناءً،
    // فتُعاد المحاولة في الطلب التالي — بينما «قائمة فارغة» كانت تتجمّد في الكاش
    // فيرى كل الزوّار «لا مطاعم» طوال مدّة التقادم بسبب فشلٍ لحظي واحد.
    if (error) {
      console.error("[public-cache] getDiscovery restaurants:", error.message);
      throw new Error(`getDiscovery: restaurants query failed — ${error.message}`);
    }

    const list = ((restaurants ?? []) as DiscoveryRestaurant[])
      .map((r) => ({ ...r, branches: (r.branches ?? []).filter((b) => b.is_active) }))
      .filter((r) => r.branches.length > 0);

    const ratings: Record<string, { sum: number; n: number }> = {};
    if (list.length) {
      const ids = list.map((r) => r.id);
      const { data: reviewRows, error: reviewsError } = await sb
        .from("reviews").select("restaurant_id, rating").eq("is_published", true).in("restaurant_id", ids);
      // فشل التقييمات ليس «صفر تقييمات»: تخزينه يمحو النجوم عن كل البطاقات
      if (reviewsError) {
        console.error("[public-cache] getDiscovery ratings:", reviewsError.message);
        throw new Error(`getDiscovery: ratings query failed — ${reviewsError.message}`);
      }
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
    if (!ids.length) return [] as { branch_id: string; total: number }[];
    const { data, error } = await anon().rpc("waitlist_counts_for", { p_branch_ids: ids });
    // «بلا عدّاد» أهون من «صفر واقفين» مكذوبٍ محفوظ في الكاش — نرمي فلا يُخزَّن
    if (error) {
      console.error("[public-cache] getHomeQueueCounts:", error.message);
      throw new Error(`getHomeQueueCounts: rpc failed — ${error.message}`);
    }
    // ‏inside/outside تعودان من الدالّة ولا تُقرآن: الأقسام صار يعرّفها المالك،
    // وتفصيلها يأتي من waitlist_counts_by_zone في صفحة المطعم. البطاقة تكتفي
    // بالإجمالي، فلا نُسلسل لكل مطعمٍ في القائمة حقلين ميّتين.
    return (data ?? []) as { branch_id: string; total: number }[];
  },
  // «queue-counts» وسمٌ خاص يُبطله انضمام الضيف وإلغاؤه فورًا (after) —
  // كان العدّاد يعيش تقادمَه العشريّ كاملًا بعد الإلغاء فتقول الرئيسية
  // «فيه طابور ١» والمطعم نفسه يقول «متاح» — شكوى المشغّل: «متناقض».
  ["home-queue-counts"],
  { revalidate: 10, tags: ["discovery", "queue-counts"] },
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
    const [categoriesRes, itemsRes, photosRes] = await Promise.all([
      sb.from("menu_categories").select("id, name, name_en").eq("branch_id", branchId).order("sort_order").order("created_at"),
      sb.from("menu_items").select("id, name, name_en, price, description, description_en, image_url, category_id").eq("branch_id", branchId).eq("is_available", true).order("created_at"),
      sb.from("restaurant_photos").select("id, url, caption").eq("branch_id", branchId).order("sort_order").order("created_at"),
    ]);
    // فشلُ أيٍّ منها كان يظهر للزبون «مطعم بلا قائمة» — وهي كذبة تُخزَّن ٦٠ث
    // وتُقدَّم لكل ماسحي الباركود. الرمي يمنع تخزينها فتُعاد المحاولة فورًا.
    const { data: categories, error: categoriesError } = categoriesRes;
    const { data: items, error: itemsError } = itemsRes;
    const { data: photos, error: photosError } = photosRes;
    const contentError = categoriesError ?? itemsError ?? photosError;
    if (contentError) {
      console.error("[public-cache] getBranchContent:", branchId, contentError.message);
      throw new Error(`getBranchContent: branch content query failed — ${contentError.message}`);
    }
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
    const { data, error } = await anon()
      .from("restaurant_photos").select("url, branch_id")
      .in("branch_id", branchIds).order("sort_order").order("created_at");
    // خريطة فارغة مخزَّنة = شريط فروعٍ بلا صور لكل الزوّار ٦٠ث بسبب فشلٍ عابر
    if (error) {
      console.error("[public-cache] getBranchStripPhotos:", error.message);
      throw new Error(`getBranchStripPhotos: photos query failed — ${error.message}`);
    }
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
    const { data, error } = await anon()
      .from("reviews").select("rating, comment, created_at, customers(full_name)")
      .eq("restaurant_id", restaurantId).eq("is_published", true)
      .order("created_at", { ascending: false }).limit(200);
    // «لا تقييمات» ظلمٌ لمطعمٍ له تقييمات — ولا يجوز تجميدها ٦٠ث في الكاش
    if (error) {
      console.error("[public-cache] getRestaurantReviews:", restaurantId, error.message);
      throw new Error(`getRestaurantReviews: reviews query failed — ${error.message}`);
    }
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
    const { data, error } = await anon()
      .from("restaurants")
      .select("name, cuisine, description, logo_url, cover_url")
      .eq("slug", slug)
      .eq("is_active", true)
      .eq("is_canary", false)
      .maybeSingle();
    // هذه وحدها لا ترمي — بخلاف بقيّة دوال الملف. سبب الرمي هناك أن الفشل
    // يُخزَّن فيُقدَّم للجميع؛ أمّا هنا فالمستدعي هو generateMetadata، والرمي
    // فيه يُسقط صفحة المطعم كلّها من أجل عنوان معاينةٍ في واتساب. أن يفقد
    // الرابط اسمه خمس دقائق أهون بكثير من أن يفقد الزبون صفحته.
    if (error) {
      console.error("[public-cache] getRestaurantMeta:", slug, error.message);
      return null;
    }
    return data;
  },
  ["restaurant-meta-v1"],
  { revalidate: 300, tags: ["discovery"] },
);

/**
 * توزيع الطابور على الأقسام — للرئيسية. كاش ١٠ث كعدّاد الإجمالي.
 *
 * يُعرض لمطعم الفرع الواحد وحده: «٣ عوائل · ٢ أفراد» أدقّ من «٥ بالانتظار»،
 * لأن العميل يسأل «أين أجلس؟» لا «كم العدد؟». ومتعدّد الفروع لا رقم له من
 * الخارج أصلًا (انظر page.tsx).
 */
export const getHomeZoneCounts = unstable_cache(
  async (ids: string[]) => {
    if (!ids.length) return [] as { branch_id: string; zone_key: string; waiting: number }[];
    const { data, error } = await anon().rpc("waitlist_counts_by_zone", { p_branch_ids: ids });
    if (error) {
      console.error("[public-cache] getHomeZoneCounts:", error.message);
      throw new Error(`getHomeZoneCounts: rpc failed — ${error.message}`);
    }
    return (data ?? []) as { branch_id: string; zone_key: string; waiting: number }[];
  },
  ["home-zone-counts"],
  { revalidate: 10, tags: ["discovery", "queue-counts"] },
);

/** أسماء الأقسام كما سمّاها المالك — كاش ٦٠ث (تتغيّر نادرًا). */
export const getHomeZoneNames = unstable_cache(
  async (ids: string[]) => {
    if (!ids.length) return [] as { branch_id: string; key: string; name: string; sort_order: number }[];
    const { data, error } = await anon()
      .from("branch_zones")
      .select("branch_id, key, name, sort_order")
      .in("branch_id", ids)
      .eq("is_active", true);
    if (error) {
      console.error("[public-cache] getHomeZoneNames:", error.message);
      throw new Error(`getHomeZoneNames: query failed — ${error.message}`);
    }
    return (data ?? []) as { branch_id: string; key: string; name: string; sort_order: number }[];
  },
  ["home-zone-names"],
  { revalidate: 60, tags: ["discovery"] },
);
