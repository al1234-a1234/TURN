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
        <Link href="/restaurants" className="icon-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <span className="truncate font-extrabold text-[color:var(--foreground)]">{restaurant.name}</span>
        <div className="h-11 w-11" />
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-12 pt-4">
        {/* بطاقة المطعم: غلاف بعرض كامل + شعار متراكب على الحافّة */}
        <div className="soft-card overflow-hidden">
          <div className="relative">
            <div className="h-[200px] w-full bg-gradient-to-tr from-brand-700 to-brand-500">
              {restaurant.cover_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={restaurant.cover_url} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <span className="absolute -bottom-9 right-5 flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-full border-4 border-[var(--surface)] bg-brand-600 text-2xl font-extrabold text-white shadow-[var(--shadow-lift)]">
              {restaurant.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={restaurant.logo_url} alt="" className="h-full w-full object-cover" />
              ) : (
                initial
              )}
            </span>
          </div>

          <div className="px-5 pb-5 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-extrabold text-[color:var(--foreground)]">{restaurant.name}</h1>
              {city && <span className="chip">{city}</span>}
            </div>
            {restaurant.name_en && (
              <p className="mt-0.5 text-sm text-[color:var(--muted)]" dir="ltr">{restaurant.name_en}</p>
            )}
            {restaurant.description && (
              <p className="mt-3 line-clamp-2 text-[15px] leading-7 text-[color:var(--muted)]">
                {restaurant.description}
              </p>
            )}
          </div>
        </div>

        <div className="mt-6">
          <RestaurantTabs categories={categories ?? []} items={items ?? []}>
            {waitlistPanel}
          </RestaurantTabs>
        </div>
      </main>
    </div>
  );
}
