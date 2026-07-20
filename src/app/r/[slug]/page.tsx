import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WaitlistForm } from "./waitlist-form";
import { RestaurantTabs } from "./restaurant-tabs";

const ZONE_LABEL: Record<string, string> = {
  any: "أي مكان",
  inside: "الداخل",
  outside: "الخارج",
};

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
  let activeEntry: { position: number | null; zone: string; party_size: number } | null = null;
  if (user) {
    const { data: customer } = await supabase.from("customers").select("id, full_name, phone").eq("user_id", user.id).maybeSingle();
    defaultName = customer?.full_name ?? "";
    defaultPhone = customer?.phone ?? "";
    if (customer && branchList.length) {
      const { data: entry } = await supabase
        .from("waitlist_entries")
        .select("position, zone, party_size")
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

  const waitlistPanel = !hasBranches ? (
    <div className="soft-card p-10 text-center text-[color:var(--muted)]">
      <span className="text-4xl">🏝️</span>
      <p className="mt-3 text-sm">لا توجد فروع متاحة حاليًا.</p>
    </div>
  ) : activeEntry ? (
    <div className="soft-card flex flex-col items-center gap-3 p-8 text-center">
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-600 text-3xl font-extrabold text-white shadow-[var(--shadow-lift)]">
        #{activeEntry.position ?? "—"}
      </span>
      <p className="text-xl font-extrabold text-brand-800 dark:text-cream-100">أنت في قائمة الانتظار</p>
      <p className="text-sm text-[color:var(--muted)]">
        دورك رقم {activeEntry.position ?? "—"} · {activeEntry.party_size} أشخاص · {ZONE_LABEL[activeEntry.zone] ?? activeEntry.zone}
      </p>
    </div>
  ) : user ? (
    <WaitlistForm slug={slug} branches={withCounts} defaultName={defaultName} defaultPhone={defaultPhone} />
  ) : (
    <div className="space-y-4">
      <div className="soft-card grid grid-cols-2 divide-x divide-x-reverse divide-[var(--border)] p-6 text-center">
        <div>
          <p className="text-sm text-[color:var(--muted)]">الداخل</p>
          <p className="mt-1 text-4xl font-extrabold text-brand-700 dark:text-brand-300">{withCounts[0]?.inside ?? 0}</p>
        </div>
        <div>
          <p className="text-sm text-[color:var(--muted)]">الخارج</p>
          <p className="mt-1 text-4xl font-extrabold text-brand-700 dark:text-brand-300">{withCounts[0]?.outside ?? 0}</p>
        </div>
      </div>
      <div className="soft-card flex flex-col items-center gap-4 bg-brand-700 p-8 text-center text-white">
        <p className="text-lg font-bold">سجّل الدخول للانضمام إلى الطابور</p>
        <Link href={`/login?redirect=/r/${slug}`} className="btn btn-cream px-8">تسجيل الدخول / إنشاء حساب</Link>
      </div>
    </div>
  );

  return (
    <div className="flex flex-1 flex-col">
      <header className="app-header px-5 pb-16 pt-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link href="/restaurants" className="icon-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <span className="font-extrabold">{restaurant.name}</span>
          <div className="h-11 w-11" />
        </div>
      </header>

      <main className="mx-auto -mt-12 w-full max-w-2xl flex-1 px-5 pb-12">
        {/* بطاقة المطعم بصورة الغلاف والشعار */}
        <div className="soft-card overflow-hidden">
          <div className="h-40 w-full bg-gradient-to-tr from-brand-600 to-brand-500">
            {restaurant.cover_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={restaurant.cover_url} alt="" className="h-full w-full object-cover" />
            )}
          </div>
          <div className="flex items-center gap-4 p-4">
            <span className="-mt-12 flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-[var(--surface)] bg-brand-600 text-2xl font-extrabold text-white shadow-[var(--shadow-lift)]">
              {restaurant.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={restaurant.logo_url} alt="" className="h-full w-full object-cover" />
              ) : (
                initial
              )}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-extrabold text-brand-800 dark:text-cream-100">{restaurant.name}</h1>
              {restaurant.name_en && <p className="text-sm text-[color:var(--muted)]" dir="ltr">{restaurant.name_en}</p>}
            </div>
          </div>
          {restaurant.description && (
            <p className="px-4 pb-4 text-[15px] leading-7 text-[color:var(--muted)]">{restaurant.description}</p>
          )}
        </div>

        <div className="mt-5">
          <RestaurantTabs categories={categories ?? []} items={items ?? []}>
            {waitlistPanel}
          </RestaurantTabs>
        </div>
      </main>
    </div>
  );
}
