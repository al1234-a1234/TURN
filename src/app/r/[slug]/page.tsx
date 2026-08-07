import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRestaurantMeta, getBranchContent, getBranchStripPhotos, getRestaurantReviews } from "@/lib/supabase/public-cache";
import { SharedHeader } from "@/components/page-header";
import { WaitlistForm } from "./waitlist-form";
import { RestaurantTabs } from "./restaurant-tabs";
import { QueueTicket } from "./queue-ticket";
import { Gallery } from "./gallery";
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
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ branch?: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  // المطعم وحالة الدخول لا يعتمد أحدهما على الآخر — يُجلبان معًا. كل موجة
  // تسلسلية هنا رحلة شبكة إضافية كاملة بين الخادم وفرانكفورت تُحسّ بطئًا حقيقيًّا.
  const [{ data: restaurant }, { data: { user } }] = await Promise.all([
    supabase
      .from("restaurants")
      .select("id, name, name_en, description, is_active, logo_url, cover_url, links, cuisine, cuisine_en")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);

  if (!restaurant) notFound();

  // الفروع أولًا: القائمة والصور صارت لكل فرع على حدة (فرانشايز)
  const { data: branches } = await supabase
    .from("branches").select("id, name, city, address, branch_settings(accepts_waitlist, manually_closed, busy_now, opening_hours, has_inside, has_outside)")
    .eq("restaurant_id", restaurant.id).eq("is_active", true).order("created_at");
  const requestedBranch = (await searchParams).branch;
  const contentBranchId =
    (branches ?? []).find((b) => b.id === requestedBranch)?.id ?? branches?.[0]?.id ?? "";
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

  let defaultName = "";
  let defaultPhone = "";
  let activeEntry: { id: string; position: number | null; branch_id: string; phone: string } | null = null;
  if (user) {
    const { data: customer } = await supabase.from("customers").select("id, full_name, phone").eq("user_id", user.id).maybeSingle();
    defaultName = customer?.full_name ?? "";
    defaultPhone = customer?.phone ?? "";
    if (customer && branchList.length) {
      const { data: entry } = await supabase
        .from("waitlist_entries")
        .select("id, position, branch_id")
        .eq("customer_id", customer.id)
        .in("branch_id", branchList.map((b) => b.id))
        .in("status", ["waiting", "notified"])
        .order("joined_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      activeEntry = entry ? { ...entry, phone: customer.phone ?? "" } : null;
    }
  }

  const initial = (restaurant.name ?? "").trim().charAt(0) || "م";
  const hasBranches = branchList.length > 0;
  const city = branchList[0]?.city ?? "";
  // إجمالي الطابور من فرع العميل الفعلي (لا من الفرع الأول دائمًا)
  const total = activeEntry
    ? withCounts.find((c) => c.id === activeEntry!.branch_id)?.total ?? withCounts[0]?.total ?? 0
    : withCounts[0]?.total ?? 0;

  const waitlistPanel = !hasBranches ? (
    <NoBranchesCard />
  ) : activeEntry ? (
    <QueueTicket position={0} total={0} entryId={activeEntry.id} phone={activeEntry.phone} restaurantName={restaurant.name} restored />
  ) : (
    <WaitlistForm slug={slug} branches={withCounts} logo={restaurant.logo_url} defaultName={defaultName} defaultPhone={defaultPhone} restaurantName={restaurant.name} restaurantLogo={restaurant.logo_url} initialBranchId={requestedBranch && (branches ?? []).some((b) => b.id === requestedBranch) ? requestedBranch : undefined} />
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
        >
          {waitlistPanel}
        </RestaurantTabs>

        <Gallery photos={photos ?? []} />

        <RestaurantLinks links={(restaurant.links ?? {}) as Record<string, string>} />
      </main>
    </div>
  );
}
