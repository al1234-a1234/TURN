import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRestaurantMeta, getBranchContent, getBranchStripPhotos, getRestaurantReviews } from "@/lib/supabase/public-cache";
import { Logo } from "@/components/logo";
import { SharedHeader } from "@/components/page-header";
import { WaitlistForm } from "./waitlist-form";
import { RestaurantTabs } from "./restaurant-tabs";
import { QueueTicket } from "./queue-ticket";
import { Gallery } from "./gallery";
import { ShareButton } from "./share-button";
import { ReviewForm } from "./review-form";
import { toAr, safeExternalUrl } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { fmtDate, isWithinOpeningHours } from "@/lib/dates";
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
  const lang = await getLang();
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
  const reviewList = reviews.list.map((r) => ({
    name: r.name ?? tr(lang, "عميل", "Customer"),
    stars: r.stars,
    when: fmtDate(r.created_at, lang),
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
    <div className="rq-card p-10 text-center text-[color:var(--muted)]">
      <span className="text-4xl">🏝️</span>
      <p className="mt-3 text-sm">{tr(lang, "لا توجد فروع متاحة حاليًا.", "No branches available right now.")}</p>
    </div>
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
        <Link
          href="/"
          aria-label={tr(lang, "الصفحة الرئيسية", "Home")}
          className="flex items-center justify-center transition active:scale-95"
        >
          <Logo size={44} />
        </Link>
        <h1 className="sr-only">{restaurant.name}</h1>
        <div className="flex items-center gap-2">
          <ShareButton title={restaurant.name} />
          <Link href="/" className="rq-circle" aria-label={tr(lang, "رجوع", "Back")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </Link>
        </div>
      </SharedHeader>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-14 pt-16">
        <RestaurantTabs
          slug={slug}
          name={restaurant.name}
          nameEn={restaurant.name_en}
          cuisine={tr(lang, restaurant.cuisine ?? "مطعم", restaurant.cuisine_en ?? "Restaurant")}
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

        <Gallery photos={photos ?? []} label={tr(lang, "صور من المطعم", "Photos from the restaurant")} />

        <RestaurantLinks links={(restaurant.links ?? {}) as Record<string, string>} label={tr(lang, "تابعنا وزورنا", "Follow & visit us")} />
      </main>
    </div>
  );
}

const LINK_KEYS: { key: string; wa?: boolean }[] = [
  { key: "maps" },
  { key: "instagram" },
  { key: "x" },
  { key: "tiktok" },
  { key: "snapchat" },
  { key: "whatsapp", wa: true },
  { key: "website" },
];

/** أيقونات المنصّات — أشكال معروفة بهويتنا (أبيض على تدرّج برتقالي). */
function LinkGlyph({ k }: { k: string }) {
  const p = { fill: "none", stroke: "var(--brand-ink)", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (k) {
    case "instagram":
      return <svg width="21" height="21" viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="5" {...p} /><circle cx="12" cy="12" r="4" {...p} /><circle cx="17.2" cy="6.8" r="1.1" fill="var(--brand-ink)" stroke="none" /></svg>;
    case "maps":
      return <svg width="21" height="21" viewBox="0 0 24 24"><path d="M12 21s6.5-6.4 6.5-11A6.5 6.5 0 0 0 5.5 10c0 4.6 6.5 11 6.5 11z" {...p} /><circle cx="12" cy="10" r="2.4" {...p} /></svg>;
    case "x":
      return <svg width="19" height="19" viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19" {...p} /></svg>;
    case "tiktok":
      return <svg width="20" height="20" viewBox="0 0 24 24"><path d="M14 4v9.5a3.2 3.2 0 1 1-2.4-3.1" {...p} /><path d="M14 4c.4 2.2 1.9 3.6 4 3.8" {...p} /></svg>;
    case "snapchat":
      return <svg width="21" height="21" viewBox="0 0 24 24"><path d="M12 4c2.6 0 3.7 2 3.7 4.4 0 1 .1 1.8.5 2.3M12 4c-2.6 0-3.7 2-3.7 4.4 0 1.6-.1 2.2-.7 2.6M12 4v0" {...p} /><path d="M8 10.6c-1 .6-2 .7-2.4.9-.6.3-.3.9.2 1.2.7.4 1.6.4 1.8 1 .3.9-1.7 2-3 2.3 1 1.2 2.4 1.8 3.6 1.8M16 10.6c1 .6 2 .7 2.4.9.6.3.3.9-.2 1.2-.7.4-1.6.4-1.8 1-.3.9 1.7 2 3 2.3-1 1.2-2.4 1.8-3.6 1.8" {...p} /></svg>;
    case "whatsapp":
      return <svg width="21" height="21" viewBox="0 0 24 24"><path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.6-4A8 8 0 1 1 20 11.5z" {...p} /><path d="M9 9.2c.2-.6.4-.6.7-.6h.5c.2 0 .4.3.5.6l.5 1.2c0 .2 0 .3-.1.4l-.4.5c-.1.1-.2.3 0 .5.5.9 1.3 1.5 2.2 1.9.2.1.4 0 .5-.1l.4-.5c.1-.1.3-.2.5-.1l1.2.6c.2.1.3.2.3.4 0 .6-.4 1.2-1 1.4-.5.2-1.1.2-2.6-.5a7 7 0 0 1-3-3c-.6-1.3-.6-1.9-.7-2.6z" fill="var(--brand-ink)" stroke="none" /></svg>;
    default: // website
      return <svg width="21" height="21" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.3" {...p} /><path d="M3.7 12h16.6M12 3.7c2.6 2.4 2.6 14.2 0 16.6M12 3.7c-2.6 2.4-2.6 14.2 0 16.6" {...p} /></svg>;
  }
}

function RestaurantLinks({ links, label }: { links: Record<string, string>; label: string }) {
  // كل رابط يُمرَّر على حارس البروتوكول قبل أن يصل href — ما لا يصلح يُسقَط
  // من القائمة أصلًا فلا يُعرض زرٌّ ميّت. الفحص القديم (startsWith("http"))
  // كان يمرّر http:// غير المشفّر، ولم يكن ليمنع بروتوكولًا خبيثًا لولا أنه
  // يلصق https:// أمامه مصادفةً.
  const present = LINK_KEYS
    .map((m) => ({ ...m, href: safeExternalUrl(links[m.key]) }))
    .filter((m): m is typeof m & { href: string } => m.href !== null);
  if (present.length === 0) return null;
  return (
    <div className="mt-6 rq-card p-5 text-center">
      <p className="mb-4 font-display text-base font-bold text-[color:var(--ink)]">{label}</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {present.map((m) => {
          const raw = links[m.key].trim();
          const href = m.wa
            ? raw.startsWith("http") ? raw : `https://wa.me/${raw.replace(/\D/g, "")}`
            : raw.startsWith("http") ? raw : `https://${raw}`;
          return (
            <a
              key={m.key}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-12 w-12 items-center justify-center rounded-full transition active:scale-95"
              style={{ background: "var(--brand-solid)", boxShadow: "0 8px 18px -10px rgba(102,28,10,0.7)" }}
            >
              <LinkGlyph k={m.key} />
            </a>
          );
        })}
      </div>
    </div>
  );
}
