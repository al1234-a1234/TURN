import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WaitlistForm } from "./waitlist-form";
import { RestaurantTabs } from "./restaurant-tabs";
import { QueueTicket } from "./queue-ticket";

const AR = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
const toAr = (s: string | number) => String(s).replace(/[0-9]/g, (d) => AR[+d]);
const RATING: Record<string, string> = { eficto: "٤٫٩", "bait-almounah": "٤٫٧", noo: "٤٫٦", rudy: "٤٫٨" };
const REVIEWS: Record<string, string> = { eficto: "١٧١", "bait-almounah": "٩٨", noo: "٦٤", rudy: "٢١٣" };

export default async function RestaurantPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id, name, name_en, description, is_active, logo_url, cover_url")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (!restaurant) notFound();

  const [{ data: branches }, { data: categories }, { data: items }] = await Promise.all([
    supabase.from("branches").select("id, name, city, address").eq("restaurant_id", restaurant.id).eq("is_active", true).order("created_at"),
    supabase.from("menu_categories").select("id, name").eq("restaurant_id", restaurant.id).order("sort_order").order("created_at"),
    supabase.from("menu_items").select("id, name, price, description, image_url, category_id").eq("restaurant_id", restaurant.id).eq("is_available", true).order("created_at"),
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
  const city = branchList[0]?.city;
  const total = withCounts[0]?.total ?? 0;

  const waitlistPanel = !hasBranches ? (
    <div className="soft-card p-10 text-center text-[color:var(--muted)]">
      <span className="text-4xl">🏝️</span>
      <p className="mt-3 text-sm">لا توجد فروع متاحة حاليًا.</p>
    </div>
  ) : activeEntry ? (
    <QueueTicket position={activeEntry.position ?? 0} total={total} />
  ) : (
    <WaitlistForm slug={slug} branches={withCounts} defaultName={defaultName} defaultPhone={defaultPhone} />
  );

  return (
    <div className="flex flex-1 flex-col bg-[color:var(--background)]">
      {/* هيرو بصورة الغلاف + غطاء أخضر */}
      <div className="relative h-[250px] w-full shrink-0 bg-brand-800">
        {restaurant.cover_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={restaurant.cover_url} alt="" className="h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[color:var(--background)] via-brand-900/45 to-brand-900/35" />

        <div className="absolute inset-x-0 top-0 z-10 mx-auto flex max-w-2xl items-center justify-between px-5 pt-5">
          <Link href="/" className="icon-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <Link href={`/r/${slug}`} className="icon-btn" title="مشاركة">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 3v11M12 3l-4 4M12 3l4 4M6 12v6a2 2 0 002 2h8a2 2 0 002-2v-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-10 mx-auto max-w-2xl px-6 pb-4 text-white">
          {city && <p className="text-xs font-bold tracking-[0.3em] text-cream-200">{city}</p>}
          <h1 className="mt-1 font-display text-[32px] font-bold leading-tight drop-shadow">{restaurant.name}</h1>
          <div className="mt-2 flex items-center gap-3 text-sm font-bold text-white/90">
            <span className="text-cream-100">★ {RATING[slug] ?? "٤٫٧"}</span>
            <span className="h-1 w-1 rounded-full bg-white/50" />
            <span>{REVIEWS[slug] ?? "٤٢"} تقييم</span>
            {restaurant.name_en && (
              <>
                <span className="h-1 w-1 rounded-full bg-white/50" />
                <span dir="ltr" className="font-serif">{restaurant.name_en}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-12">
        {/* الشعار متراكب */}
        <div className="-mt-8 mb-4 flex justify-end px-1">
          <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border-[3px] border-[color:var(--background)] bg-brand-800 font-serif text-2xl font-bold text-cream-100 shadow-lg">
            {restaurant.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={restaurant.logo_url} alt="" className="h-full w-full object-cover" />
            ) : (
              initial
            )}
          </span>
        </div>

        {restaurant.description && (
          <p className="mb-4 px-1 text-[14px] leading-7 text-[color:var(--muted)]">{restaurant.description}</p>
        )}

        <RestaurantTabs
          categories={categories ?? []}
          items={items ?? []}
          rating={RATING[slug] ?? "٤٫٧"}
          reviewCount={REVIEWS[slug] ?? "٤٢"}
          queueTotal={toAr(total)}
        >
          {waitlistPanel}
        </RestaurantTabs>
      </main>
    </div>
  );
}
