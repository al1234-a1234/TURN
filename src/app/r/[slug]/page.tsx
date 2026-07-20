import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WaitlistForm } from "./waitlist-form";
import { RestaurantTabs } from "./restaurant-tabs";
import { QueueTicket } from "./queue-ticket";

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

  const waitlistPanel = !hasBranches ? (
    <div className="soft-card p-10 text-center text-[color:var(--muted)]">
      <span className="text-4xl">🏝️</span>
      <p className="mt-3 text-sm">لا توجد فروع متاحة حاليًا.</p>
    </div>
  ) : activeEntry ? (
    <QueueTicket position={activeEntry.position ?? 0} total={withCounts[0]?.total ?? 0} />
  ) : (
    <WaitlistForm slug={slug} branches={withCounts} defaultName={defaultName} defaultPhone={defaultPhone} />
  );

  return (
    <div className="flex flex-1 flex-col bg-[color:var(--bg)]">
      {/* شريط علوي نظيف ثابت */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[color:var(--bg)]/90 px-5 py-3 backdrop-blur">
        <Link href="/" className="icon-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <span className="truncate font-extrabold text-[color:var(--foreground)]">{restaurant.name}</span>
        <div className="h-11 w-11" />
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-12">
        {/* غلاف بعرض كامل يذوب في الخلفية + شعار بحدّ ذهبي متراكب */}
        <div className="reveal relative -mx-5" style={{ animationDelay: "0ms" }}>
          <div className="relative h-[240px] w-full overflow-hidden">
            <div className="h-full w-full bg-gradient-to-tr from-brand-800 to-brand-600">
              {restaurant.cover_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={restaurant.cover_url} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            {/* إذابة الغلاف في الخلفية */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#0c1712]" />
          </div>
          <span className="absolute -bottom-8 right-5 flex h-[76px] w-[76px] items-center justify-center overflow-hidden rounded-full bg-[#0c1712] text-2xl font-extrabold text-[color:var(--gold-1)] shadow-[0_16px_36px_rgba(0,0,0,0.5)] ring-2 ring-[color:var(--gold-2)]">
            {restaurant.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={restaurant.logo_url} alt="" className="h-full w-full object-cover" />
            ) : (
              initial
            )}
          </span>
        </div>

        <div className="reveal mt-12 px-1" style={{ animationDelay: "90ms" }}>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-serif text-3xl font-bold text-[color:var(--ink)]">{restaurant.name}</h1>
            {city && <span className="chip">{city}</span>}
          </div>
          {restaurant.name_en && (
            <p className="mt-1 font-serif text-lg text-[color:var(--muted)]" dir="ltr">{restaurant.name_en}</p>
          )}
          {restaurant.description && (
            <p className="mt-3 line-clamp-2 text-[15px] leading-7 text-[color:var(--muted)]">
              {restaurant.description}
            </p>
          )}
        </div>

        <div className="reveal mt-7" style={{ animationDelay: "170ms" }}>
          <RestaurantTabs categories={categories ?? []} items={items ?? []}>
            {waitlistPanel}
          </RestaurantTabs>
        </div>
      </main>
    </div>
  );
}
