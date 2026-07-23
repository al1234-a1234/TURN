import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WaitlistForm } from "./waitlist-form";
import { RestaurantTabs } from "./restaurant-tabs";
import { QueueTicket } from "./queue-ticket";
import { Gallery } from "./gallery";
import { ShareButton } from "./share-button";
import { toAr } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";

export default async function RestaurantPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const lang = await getLang();
  const supabase = await createClient();

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id, name, name_en, description, is_active, logo_url, cover_url, links, cuisine, cuisine_en")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (!restaurant) notFound();

  const [{ data: branches }, { data: categories }, { data: items }, { data: photos }, { data: offers }, { data: reviewRows }] = await Promise.all([
    supabase.from("branches").select("id, name, city, address, branch_settings(accepts_waitlist)").eq("restaurant_id", restaurant.id).eq("is_active", true).order("created_at"),
    supabase.from("menu_categories").select("id, name").eq("restaurant_id", restaurant.id).order("sort_order").order("created_at"),
    supabase.from("menu_items").select("id, name, price, description, image_url, category_id").eq("restaurant_id", restaurant.id).eq("is_available", true).order("created_at"),
    supabase.from("restaurant_photos").select("id, url, caption").eq("restaurant_id", restaurant.id).order("sort_order").order("created_at"),
    // عروض عامّة فقط للزوّار (الشرائح المستهدفة loyalty/walkaway/slow_hours تصل عبر مكافآت العميل)
    supabase.from("offers").select("id, title, description, kind, value, code, ends_at").eq("restaurant_id", restaurant.id).eq("is_active", true).in("audience", ["all", "new"]).order("created_at", { ascending: false }),
    // تقييمات حقيقية منشورة (بدل بيانات وهمية)
    supabase.from("reviews").select("rating, comment, created_at, customers(full_name)").eq("restaurant_id", restaurant.id).eq("is_published", true).order("created_at", { ascending: false }).limit(200),
  ]);

  // تجميع التقييمات الحقيقية
  const rvRows = (reviewRows ?? []) as { rating: number; comment: string | null; created_at: string; customers: { full_name: string } | { full_name: string }[] | null }[];
  const reviewCount = rvRows.length;
  const avgRating = reviewCount ? Math.round((rvRows.reduce((a, r) => a + r.rating, 0) / reviewCount) * 10) / 10 : 0;
  const ratingDist = [5, 4, 3, 2, 1].map((s) => ({ s, pct: reviewCount ? Math.round((rvRows.filter((r) => r.rating === s).length / reviewCount) * 100) : 0 }));
  const reviewList = rvRows.slice(0, 30).map((r) => {
    const c = Array.isArray(r.customers) ? r.customers[0] : r.customers;
    return {
      name: c?.full_name?.trim() || tr(lang, "عميل", "Customer"),
      stars: r.rating,
      when: new Date(r.created_at).toLocaleDateString(lang === "en" ? "en-GB" : "ar-SA-u-nu-latn", { day: "2-digit", month: "short", year: "numeric" }),
      text: r.comment ?? "",
    };
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const branchList = branches ?? [];
  const withCounts = await Promise.all(
    branchList.map(async (b) => {
      const { data } = await supabase.rpc("waitlist_counts", { b_id: b.id });
      const c = Array.isArray(data) ? data[0] : undefined;
      return { id: b.id, name: b.name, total: c?.total ?? 0, inside: c?.inside ?? 0, outside: c?.outside ?? 0 };
    }),
  );

  let defaultName = "";
  let defaultPhone = "";
  let activeEntry: { position: number | null; branch_id: string } | null = null;
  if (user) {
    const { data: customer } = await supabase.from("customers").select("id, full_name, phone").eq("user_id", user.id).maybeSingle();
    defaultName = customer?.full_name ?? "";
    defaultPhone = customer?.phone ?? "";
    if (customer && branchList.length) {
      const { data: entry } = await supabase
        .from("waitlist_entries")
        .select("position, branch_id")
        .eq("customer_id", customer.id)
        .in("branch_id", branchList.map((b) => b.id))
        .in("status", ["waiting", "notified"])
        .order("joined_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      activeEntry = entry ?? null;
    }
  }

  const initial = (restaurant.name ?? "").trim().charAt(0) || "م";
  const hasBranches = branchList.length > 0;
  const city = branchList[0]?.city ?? "";
  // إجمالي الطابور من فرع العميل الفعلي (لا من الفرع الأول دائمًا)
  const total = activeEntry
    ? withCounts.find((c) => c.id === activeEntry!.branch_id)?.total ?? withCounts[0]?.total ?? 0
    : withCounts[0]?.total ?? 0;
  const s0 = branchList[0] as { branch_settings?: { accepts_waitlist: boolean } | { accepts_waitlist: boolean }[] | null } | undefined;
  const settings0 = Array.isArray(s0?.branch_settings) ? s0?.branch_settings[0] : s0?.branch_settings;
  const accepts = settings0?.accepts_waitlist ?? true;

  const waitlistPanel = !hasBranches ? (
    <div className="rq-card p-10 text-center text-[color:var(--muted)]">
      <span className="text-4xl">🏝️</span>
      <p className="mt-3 text-sm">{tr(lang, "لا توجد فروع متاحة حاليًا.", "No branches available right now.")}</p>
    </div>
  ) : activeEntry ? (
    <QueueTicket position={activeEntry.position ?? 0} total={total} />
  ) : (
    <WaitlistForm slug={slug} branches={withCounts} accepts={accepts} defaultName={defaultName} defaultPhone={defaultPhone} restaurantName={restaurant.name} restaurantLogo={restaurant.logo_url} />
  );

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* هيدر المطعم */}
      <header className="rq-header px-5 pb-16 pt-5">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <ShareButton title={restaurant.name} />
          <h1 className="font-display text-2xl font-bold">{restaurant.name}</h1>
          <Link href="/" className="rq-circle" aria-label={tr(lang, "رجوع", "Back")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </Link>
        </div>
      </header>

      <main className="mx-auto -mt-11 w-full max-w-2xl flex-1 px-5 pb-14">
        <RestaurantTabs
          slug={slug}
          name={restaurant.name}
          nameEn={restaurant.name_en}
          cuisine={tr(lang, restaurant.cuisine ?? "مطعم", restaurant.cuisine_en ?? "Restaurant")}
          description={restaurant.description}
          rating={reviewCount ? String(avgRating) : "—"}
          reviewCount={String(reviewCount)}
          reviews={reviewList}
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

        <OffersSection offers={(offers ?? []) as OfferLite[]} lang={lang} />

        <Gallery photos={photos ?? []} label={tr(lang, "صور من المطعم", "Photos from the restaurant")} />

        <RestaurantLinks links={(restaurant.links ?? {}) as Record<string, string>} label={tr(lang, "تابعنا وزورنا", "Follow & visit us")} />
      </main>
    </div>
  );
}

type OfferLite = {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  value: number | null;
  code: string | null;
  ends_at: string | null;
};

function offerBadge(o: OfferLite, lang: "ar" | "en"): string {
  if (o.kind === "percent" && o.value != null) return `${toAr(o.value)}${lang === "en" ? "%" : "٪"}`;
  if (o.kind === "fixed" && o.value != null) return `${toAr(Math.round(o.value))} ${tr(lang, "ر.س", "SAR")}`;
  if (o.kind === "points" && o.value != null) return `×${toAr(o.value)}`;
  if (o.kind === "free_item") return tr(lang, "مجاني", "Free");
  if (o.kind === "bogo") return "1+1";
  return "★";
}

/** عروض المطعم العامّة + منفذ للهدايا الشخصية — يشوفها أي عميل. */
function OffersSection({ offers, lang }: { offers: OfferLite[]; lang: "ar" | "en" }) {
  return (
    <div className="mt-6">
      <p className="mb-3 font-display text-base font-bold text-[color:var(--ink)]">{tr(lang, "العروض والمكافآت", "Offers & rewards")}</p>

      {offers.length > 0 ? (
        <div className="space-y-2.5">
          {offers.map((o) => (
            <div key={o.id} className="rq-card flex items-center gap-3 p-3.5">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl font-display text-lg font-extrabold text-white" style={{ background: "linear-gradient(155deg,#a8371a,#661c0a)" }}>
                {offerBadge(o, lang)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-[15px] font-bold text-[color:var(--ink)]">{o.title}</p>
                {o.description && <p className="mt-0.5 truncate text-[13px] text-[color:var(--muted)]">{o.description}</p>}
                {o.ends_at && (
                  <p className="mt-0.5 text-[11px] font-bold text-[color:var(--muted)]">
                    {tr(lang, "ينتهي", "Ends")} {new Date(o.ends_at).toLocaleDateString(lang === "en" ? "en-GB" : "ar-SA-u-nu-latn", { day: "2-digit", month: "short" })}
                  </p>
                )}
              </div>
              {o.code && (
                <span dir="ltr" className="shrink-0 rounded-lg bg-brand-800 px-2.5 py-1 text-xs font-extrabold text-cream-100">{o.code}</span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rq-card p-5 text-center text-sm text-[color:var(--muted)]">
          {tr(lang, "لا توجد عروض عامّة حاليًا.", "No public offers right now.")}
        </div>
      )}

      {/* منفذ الهدايا الشخصية (بلا حساب — عبر الرقم) */}
      <Link href="/me/rewards" className="mt-2.5 flex items-center justify-between rounded-2xl px-4 py-3" style={{ background: "linear-gradient(160deg,#faefe8,#f4ddd0)", border: "1px solid rgba(102,28,10,0.14)" }}>
        <span className="flex items-center gap-2 text-sm font-bold" style={{ color: "var(--brand-d)" }}>
          <span>🎁</span> {tr(lang, "عندك هديّة خاصة؟ اعرفها برقمك", "Got a personal reward? Check with your number")}
        </span>
        <span className="text-[color:var(--brand-d)]">←</span>
      </Link>
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
  const p = { fill: "none", stroke: "#fff", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (k) {
    case "instagram":
      return <svg width="21" height="21" viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="5" {...p} /><circle cx="12" cy="12" r="4" {...p} /><circle cx="17.2" cy="6.8" r="1.1" fill="#fff" stroke="none" /></svg>;
    case "maps":
      return <svg width="21" height="21" viewBox="0 0 24 24"><path d="M12 21s6.5-6.4 6.5-11A6.5 6.5 0 0 0 5.5 10c0 4.6 6.5 11 6.5 11z" {...p} /><circle cx="12" cy="10" r="2.4" {...p} /></svg>;
    case "x":
      return <svg width="19" height="19" viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19" {...p} /></svg>;
    case "tiktok":
      return <svg width="20" height="20" viewBox="0 0 24 24"><path d="M14 4v9.5a3.2 3.2 0 1 1-2.4-3.1" {...p} /><path d="M14 4c.4 2.2 1.9 3.6 4 3.8" {...p} /></svg>;
    case "snapchat":
      return <svg width="21" height="21" viewBox="0 0 24 24"><path d="M12 4c2.6 0 3.7 2 3.7 4.4 0 1 .1 1.8.5 2.3M12 4c-2.6 0-3.7 2-3.7 4.4 0 1.6-.1 2.2-.7 2.6M12 4v0" {...p} /><path d="M8 10.6c-1 .6-2 .7-2.4.9-.6.3-.3.9.2 1.2.7.4 1.6.4 1.8 1 .3.9-1.7 2-3 2.3 1 1.2 2.4 1.8 3.6 1.8M16 10.6c1 .6 2 .7 2.4.9.6.3.3.9-.2 1.2-.7.4-1.6.4-1.8 1-.3.9 1.7 2 3 2.3-1 1.2-2.4 1.8-3.6 1.8" {...p} /></svg>;
    case "whatsapp":
      return <svg width="21" height="21" viewBox="0 0 24 24"><path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.6-4A8 8 0 1 1 20 11.5z" {...p} /><path d="M9 9.2c.2-.6.4-.6.7-.6h.5c.2 0 .4.3.5.6l.5 1.2c0 .2 0 .3-.1.4l-.4.5c-.1.1-.2.3 0 .5.5.9 1.3 1.5 2.2 1.9.2.1.4 0 .5-.1l.4-.5c.1-.1.3-.2.5-.1l1.2.6c.2.1.3.2.3.4 0 .6-.4 1.2-1 1.4-.5.2-1.1.2-2.6-.5a7 7 0 0 1-3-3c-.6-1.3-.6-1.9-.7-2.6z" fill="#fff" stroke="none" /></svg>;
    default: // website
      return <svg width="21" height="21" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.3" {...p} /><path d="M3.7 12h16.6M12 3.7c2.6 2.4 2.6 14.2 0 16.6M12 3.7c-2.6 2.4-2.6 14.2 0 16.6" {...p} /></svg>;
  }
}

function RestaurantLinks({ links, label }: { links: Record<string, string>; label: string }) {
  const present = LINK_KEYS.filter((m) => (links[m.key] ?? "").trim());
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
              style={{ background: "linear-gradient(155deg,#a8371a,#661c0a)", boxShadow: "0 8px 18px -10px rgba(102,28,10,0.7)" }}
            >
              <LinkGlyph k={m.key} />
            </a>
          );
        })}
      </div>
    </div>
  );
}
