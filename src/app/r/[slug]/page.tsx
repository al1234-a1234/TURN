import { notFound } from "next/navigation";
import { getRestaurantMeta, getBranchContent, getBranchStripPhotos, getRestaurantReviews, publicRead } from "@/lib/supabase/public-cache";
import { SharedHeader } from "@/components/page-header";
import { WaitlistForm } from "./waitlist-form";
import { RestaurantTabs } from "./restaurant-tabs";
import { ShareButton } from "./share-button";
import { ReviewForm } from "./review-form";
import { toAr, safeExternalUrl } from "@/lib/format";
import { isWithinOpeningHours } from "@/lib/dates";
import { HomeLink, BackLink, NoBranchesCard, RestaurantLinks } from "./localized";
import type { Metadata } from "next";
import { SmartImage } from "@/components/smart-image";

/* معاينة المشاركة: رابط المطعم في واتساب/تويتر كان يظهر بعنوان «دور | Turn»
   العام بلا اسم ولا شعار — هنا يظهر اسم المطعم وشعاره، فيصير الرابط الذي
   يوزّعه صاحب المطعم لعملائه دعاية له لا لنا فقط. */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  // مكاش ٥ دقائق — كان استعلامًا حيًّا يحجب الرأس في كل فتحة (انظر public-cache)
  const r = await getRestaurantMeta(slug);
  if (!r) return { title: "إيت | EIGHT" };
  const title = `${r.name} | إيت`;
  const description = `خذ دورك في ${r.name}${r.cuisine ? ` — ${r.cuisine}` : ""} بلا انتظار على الباب. شوف الطابور الحيّ والقائمة والهدايا.`;
  const image = r.cover_url ?? r.logo_url;
  return {
    title,
    description,
    openGraph: { title, description, ...(image ? { images: [image] } : {}) },
    twitter: { card: image ? "summary_large_image" : "summary", title, description },
  };
}

export default async function RestaurantPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // عميل قراءة عامّ بلا كوكيز. `createClient()` يستدعي `await cookies()` —
  // وقراءة كوكي واحدة في أيّ موضع تُسقط توليد المسار كلّه مسبقًا، فتسافر كل
  // مسحة باركود إلى فرانكفورت قبل أن يرى العميل شيئًا. وكل ما تحتاجه هذه
  // الصفحة عامٌّ خلف RLS: المطعم وفروعه وعدّاد طابوره.
  const supabase = publicRead();

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id, name, name_en, description, is_active, logo_url, cover_url, links, cuisine, cuisine_en")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (!restaurant) notFound();

  // الفروع أولًا: القائمة والصور صارت لكل فرع على حدة (فرانشايز)
  const { data: branches } = await supabase
    .from("branches").select("id, name, city, address, branch_settings(accepts_waitlist, manually_closed, busy_now, opening_hours, has_inside, has_outside)")
    .eq("restaurant_id", restaurant.id).eq("is_active", true).order("created_at");
  // منيو الفرع الأول وحده يُولَّد مسبقًا. قراءة `?branch=` هنا كانت تُجبر
  // Next على توليد الصفحة عند كل طلب — أي أن كل مسحة باركود تدفع ثمن ميزةٍ
  // نادرة. الفرع المطلوب يُقرأ في المتصفّح، ومنيوه يُجلب عند التبديل وحده.
  const contentBranchId = branches?.[0]?.id ?? "";
  const branchList = branches ?? [];

  // المسار الحرج: كل ما هو ثابت (قائمة/صور/تقييمات/شريط الفروع) يُقرأ من كاش ٦٠ث
  // — كان يُجلب حيًّا في كل مسحٍ للباركود (المسحات ≫ الانضمامات). يبقى حيًّا فقط
  // ما يجب أن يكون لحظيًّا: عدّاد الطابور. فروع/إعداداتها جُلبت أعلاه (حيّة للحظية
  // busy_now/manually_closed). موجة واحدة تجمع الكاش مع عدّاد الطابور الحيّ.
  const [branchContent, photoMap, reviews, { data: countRows }] = await Promise.all([
    getBranchContent(contentBranchId),
    getBranchStripPhotos(branchList.map((b) => b.id)),
    getRestaurantReviews(restaurant.id),
    branchList.length
      ? supabase.rpc("waitlist_counts_for", { p_branch_ids: branchList.map((b) => b.id) })
      : Promise.resolve({ data: [] as { branch_id: string; total: number; inside: number; outside: number }[] }),
  ]);
  const categories = branchContent.categories;
  const items = branchContent.items;
  const photos = branchContent.photos;

  // التقييمات محسوبة في الكاش؛ التنسيق حسب اللغة والاسم البديل هنا (الكاش محايد للّغة)
  const reviewCount = reviews.count;
  const avgRating = reviews.avg;
  const ratingDist = reviews.dist;
  // خامًا لا منسّقًا: الاسم البديل وتنسيق التاريخ يحتاجان اللغة، وقراءتها
  // على الخادم هي ما كان يمنع توليد الصفحة مسبقًا. RestaurantTabs يعرفها.
  const reviewList = reviews.list.map((r) => ({
    name: r.name,
    stars: r.stars,
    created_at: r.created_at,
    text: r.text,
  }));

  const photoOf = new Map<string, string>(Object.entries(photoMap));

  const countOf = new Map((countRows ?? []).map((c) => [c.branch_id, c]));
  const withCounts = branchList.map((b) => {
    const c = countOf.get(b.id);
    const bs = Array.isArray(b.branch_settings) ? b.branch_settings[0] : b.branch_settings;
    const settings = bs as { accepts_waitlist?: boolean; manually_closed?: boolean; busy_now?: boolean; opening_hours?: { open?: string; close?: string } | null; has_inside?: boolean; has_outside?: boolean } | null;
    return {
      id: b.id,
      name: b.name,
      city: (b as { city?: string | null }).city ?? "",
      total: Number(c?.total ?? 0),
      inside: Number(c?.inside ?? 0),
      outside: Number(c?.outside ?? 0),
      // أقسام يملكها الفرع فعلًا — لا نعرض للعميل ما لا وجود له
      hasInside: settings?.has_inside ?? true,
      hasOutside: settings?.has_outside ?? true,
      accepts: settings?.accepts_waitlist ?? true,
      closedNow: (settings?.manually_closed ?? false) || !isWithinOpeningHours(settings?.opening_hours ?? null),
      busyNow: settings?.busy_now ?? false,
      photo: photoOf.get(b.id) ?? null,
    };
  });

  /* كتلة الجلسة حُذفت من الخادم — وهذا آخر ما كان يمنع توليد الصفحة مسبقًا.
     كانت تفعل شيئين، وكلاهما مغطّى بلا خادم:

     ١) تعبئة الاسم والجوّال: النموذج يقرؤهما من التخزين المحلّي، وهذا يعمل
        للضيف أيضًا — والضيف هو الغالبية العظمى، فلم يكن يستفيد منها أصلًا.
     ٢) عرض تذكرتك بدل النموذج: `waitlist-form` يسترجعها من `lastTurnFor(slug)`
        عند التحميل منذ البداية.

     ولا خطر تكرار دور: `uniq_waitlist_live_customer_branch` يمنع صفًّا حيًّا
     ثانيًا لنفس العميل في نفس الفرع، و`join_waitlist_guest` متماثِلة — تبحث
     عن دورٍ حيّ بالرقم قبل الإدخال وتُعيده، وتلتقط unique_violation وتُعيد
     الصفّ القائم إن تسابق طلبان. أي أن جهازًا جديدًا يُعيد التذكرة نفسها. */

  const initial = (restaurant.name ?? "").trim().charAt(0) || "م";
  const hasBranches = branchList.length > 0;
  const city = branchList[0]?.city ?? "";
  // إجمالي الطابور من فرع العميل الفعلي (لا من الفرع الأول دائمًا)
  const total = withCounts[0]?.total ?? 0;

  // النموذج دائمًا: هو من يقرّر عرض التذكرة بدلًا منه، بعد أن يقرأ الدور
  // المحفوظ محلّيًّا. كان الخادم يقرّر ذلك، وثمنه كان الصفحة كلّها.
  const waitlistPanel = !hasBranches ? (
    <NoBranchesCard />
  ) : (
    <WaitlistForm slug={slug} branches={withCounts} logo={restaurant.logo_url} restaurantName={restaurant.name} restaurantLogo={restaurant.logo_url} />
  );

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* هيدر المطعم — نفس هيدر الرئيسية حرفيًّا (SharedHeader): الارتفاع واللون
          والانحناءات مصدر واحد. شعار دور بنفس مقاسه وموضعه بالرئيسية تمامًا
          (زاوية الصفّ العلوي)، وشعار المطعم يتجاوز الحافة السفلية (overlap). */}
      <SharedHeader
        overlap={
          // pointer-events-none: بلا هذا، هذا الغلاف الشفاف (عرض كامل الهيدر)
          // يبتلع ضغطات زرّي الرجوع/المشاركة تحته لأنه يُرسَم بعدهما بالـDOM
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
            {/* نصفه داخل الهيدر ونصفه خارجه — على الحافة السفلية بالضبط. */}
            <span className="flex h-20 w-20 shrink-0 translate-y-1/2 items-center justify-center overflow-hidden rounded-full bg-white/15 font-serif text-2xl font-bold text-cream-100 ring-4 ring-[var(--background)] backdrop-blur-sm">
<SmartImage src={restaurant.logo_url} fallbackText={initial} alt="" width={72} height={72} sizes="72px" className="h-full w-full object-cover" />
            </span>
          </div>
        }
      >
        <HomeLink />
        <h1 className="sr-only">{restaurant.name}</h1>
        <div className="flex items-center gap-2">
          <ShareButton title={restaurant.name} />
          <BackLink />
        </div>
      </SharedHeader>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-14 pt-16">
        <RestaurantTabs
          slug={slug}
          name={restaurant.name}
          nameEn={restaurant.name_en}
          cuisine={restaurant.cuisine}
          cuisineEn={restaurant.cuisine_en}
          description={restaurant.description}
          rating={reviewCount ? String(avgRating) : "—"}
          reviewCount={String(reviewCount)}
          reviews={reviewList}
          reviewForm={<ReviewForm slug={slug} googleUrl={safeExternalUrl(((restaurant.links ?? {}) as Record<string, string>).google)} />}
          dist={ratingDist}
          city={city}
          cover={restaurant.cover_url}
          logo={restaurant.logo_url}
          initial={initial}
          queueTotal={toAr(total)}
          categories={categories ?? []}
          items={items ?? []}
          photos={photos ?? []}
        >
          {waitlistPanel}
        </RestaurantTabs>

        <RestaurantLinks links={(restaurant.links ?? {}) as Record<string, string>} />
      </main>
    </div>
  );
}

/**
 * الصفحة تُولَّد مسبقًا وتُخدَم من أقرب نقطة للعميل، وتتجدّد كل ٦٠ث.
 *
 * لم يكن هذا ممكنًا حتى سقطت ثلاثة حواجز: قراءة كوكي اللغة، وقراءة
 * `?branch=`، وعميل Supabase الذي يقرأ الكوكيز (`createClient`). أيّ واحدٍ
 * منها يعيد المسار ديناميكيًّا ويعيد كل مسحة باركود إلى رحلة فرانكفورت.
 *
 * ولم أستعمل `dynamic = "force-static"`: هي تُخرِس قراءة الكوكيز بدل أن
 * تُفشل البناء، فيمرّ الخطأ صامتًا يومًا ما. `generateStaticParams` تعطي
 * التوليد المسبق نفسه، ويبقى أي `cookies()` مستقبليّ خطأً صاخبًا.
 */
export const revalidate = 60;

export async function generateStaticParams() {
  try {
    const { data } = await publicRead()
      .from("restaurants").select("slug").eq("is_active", true);
    return (data ?? []).map((r) => ({ slug: r.slug }));
  } catch {
    // انقطاعٌ لحظي وقت البناء لا يُفشل النشر — المطاعم تُولَّد عند أول طلب
    return [];
  }
}
