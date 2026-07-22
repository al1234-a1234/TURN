import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WaitlistForm } from "./waitlist-form";
import { RestaurantTabs } from "./restaurant-tabs";
import { QueueTicket } from "./queue-ticket";
import { toAr } from "@/lib/format";

const RATING: Record<string, string> = { eficto: "٤٫٩", "bait-almounah": "٤٫٧", noo: "٤٫٦", rudy: "٤٫٨" };
const REVIEWS: Record<string, string> = { eficto: "١٧١", "bait-almounah": "٩٨", noo: "٦٤", rudy: "٢١٣" };
const LIKES: Record<string, string> = { eficto: "٢٨٦", "bait-almounah": "١٤٢", noo: "٩٧", rudy: "٢٢٩" };
const DIST: Record<string, string> = { eficto: "٣٫٣", "bait-almounah": "٥٫٢", noo: "٨٫٩", rudy: "٧٫١" };
const CUISINE: Record<string, string> = { eficto: "إيطالي", "bait-almounah": "شعبي", noo: "بحري", rudy: "بيتزا" };

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
    supabase.from("branches").select("id, name, city, address, branch_settings(accepts_waitlist)").eq("restaurant_id", restaurant.id).eq("is_active", true).order("created_at"),
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
  const city = branchList[0]?.city ?? "";
  const total = withCounts[0]?.total ?? 0;
  const s0 = branchList[0] as { branch_settings?: { accepts_waitlist: boolean } | { accepts_waitlist: boolean }[] | null } | undefined;
  const settings0 = Array.isArray(s0?.branch_settings) ? s0?.branch_settings[0] : s0?.branch_settings;
  const accepts = settings0?.accepts_waitlist ?? true;

  const waitlistPanel = !hasBranches ? (
    <div className="rq-card p-10 text-center text-[color:var(--muted)]">
      <span className="text-4xl">🏝️</span>
      <p className="mt-3 text-sm">لا توجد فروع متاحة حاليًا.</p>
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
          <button className="rq-circle" aria-label="مشاركة">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3v12M12 3l-4 4M12 3l4 4M6 13v5a2 2 0 002 2h8a2 2 0 002-2v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <h1 className="font-display text-2xl font-bold">{restaurant.name}</h1>
          <Link href="/" className="rq-circle" aria-label="رجوع">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </Link>
        </div>
      </header>

      <main className="mx-auto -mt-11 w-full max-w-2xl flex-1 px-5 pb-14">
        <RestaurantTabs
          name={restaurant.name}
          nameEn={restaurant.name_en}
          cuisine={CUISINE[slug] ?? "مطعم"}
          description={restaurant.description}
          rating={RATING[slug] ?? "٤٫٧"}
          reviewCount={REVIEWS[slug] ?? "٤٢"}
          likes={LIKES[slug] ?? "٥٠"}
          distanceKm={DIST[slug] ?? "٤٫٠"}
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
      </main>
    </div>
  );
}
