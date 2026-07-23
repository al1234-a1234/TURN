import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WaitlistForm } from "./waitlist-form";
import { RestaurantTabs } from "./restaurant-tabs";
import { QueueTicket } from "./queue-ticket";
import { toAr } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";

const RATING: Record<string, string> = { eficto: "4.9", "bait-almounah": "4.7", noo: "4.6", rudy: "4.8" };
const REVIEWS: Record<string, string> = { eficto: "171", "bait-almounah": "98", noo: "64", rudy: "213" };
const LIKES: Record<string, string> = { eficto: "286", "bait-almounah": "142", noo: "97", rudy: "229" };
const DIST: Record<string, string> = { eficto: "3.3", "bait-almounah": "5.2", noo: "8.9", rudy: "7.1" };
const CUISINE: Record<string, string> = { eficto: "إيطالي", "bait-almounah": "شعبي", noo: "بحري", rudy: "بيتزا" };

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
    .select("id, name, name_en, description, is_active, logo_url, cover_url, links")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (!restaurant) notFound();

  const [{ data: branches }, { data: categories }, { data: items }, { data: photos }] = await Promise.all([
    supabase.from("branches").select("id, name, city, address, branch_settings(accepts_waitlist)").eq("restaurant_id", restaurant.id).eq("is_active", true).order("created_at"),
    supabase.from("menu_categories").select("id, name").eq("restaurant_id", restaurant.id).order("sort_order").order("created_at"),
    supabase.from("menu_items").select("id, name, price, description, image_url, category_id").eq("restaurant_id", restaurant.id).eq("is_available", true).order("created_at"),
    supabase.from("restaurant_photos").select("id, url, caption").eq("restaurant_id", restaurant.id).order("sort_order").order("created_at"),
  ]);

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
  let activeEntry: { position: number | null } | null = null;
  if (user) {
    const { data: customer } = await supabase.from("customers").select("id, full_name, phone").eq("user_id", user.id).maybeSingle();
    defaultName = customer?.full_name ?? "";
    defaultPhone = customer?.phone ?? "";
    if (customer && branchList.length) {
      const { data: entry } = await supabase
        .from("waitlist_entries")
        .select("position")
        .eq("customer_id", customer.id)
        .in("branch_id", branchList.map((b) => b.id))
        .in("status", ["waiting", "notified"])
        .order("joined_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      activeEntry = entry ?? null;
    }
  }

  const initial = restaurant.name.trim().charAt(0) || "م";
  const hasBranches = branchList.length > 0;
  const city = branchList[0]?.city ?? "";
  const total = withCounts[0]?.total ?? 0;
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
    <WaitlistForm slug={slug} branches={withCounts} accepts={accepts} defaultName={defaultName} defaultPhone={defaultPhone} />
  );

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* هيدر المطعم */}
      <header className="rq-header px-5 pb-16 pt-5">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <button className="rq-circle" aria-label={tr(lang, "مشاركة", "Share")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3v12M12 3l-4 4M12 3l4 4M6 13v5a2 2 0 002 2h8a2 2 0 002-2v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <h1 className="font-display text-2xl font-bold">{restaurant.name}</h1>
          <Link href="/" className="rq-circle" aria-label={tr(lang, "رجوع", "Back")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </Link>
        </div>
      </header>

      <main className="mx-auto -mt-11 w-full max-w-2xl flex-1 px-5 pb-14">
        <RestaurantTabs
          name={restaurant.name}
          nameEn={restaurant.name_en}
          cuisine={CUISINE[slug] ?? tr(lang, "مطعم", "Restaurant")}
          description={restaurant.description}
          rating={RATING[slug] ?? "4.7"}
          reviewCount={REVIEWS[slug] ?? "42"}
          likes={LIKES[slug] ?? "50"}
          distanceKm={DIST[slug] ?? "4.0"}
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

/** معرض صور المطعم — قابل للتقليب بالسحب (scroll-snap). */
function Gallery({ photos, label }: { photos: { id: string; url: string; caption: string | null }[]; label: string }) {
  if (!photos.length) return null;
  return (
    <div className="mt-6">
      <p className="mb-3 font-display text-base font-bold text-[color:var(--ink)]">{label}</p>
      <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {photos.map((ph) => (
          <div key={ph.id} className="relative aspect-[4/3] w-[80%] shrink-0 snap-center overflow-hidden rounded-3xl border sm:w-[46%]" style={{ borderColor: "var(--border)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ph.url} alt={ph.caption ?? ""} className="h-full w-full object-cover" />
            {ph.caption && (
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent p-3 text-sm font-bold text-white">{ph.caption}</span>
            )}
          </div>
        ))}
      </div>
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
