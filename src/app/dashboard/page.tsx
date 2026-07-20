import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/logout-button";
import { CreateRestaurantForm } from "./create-restaurant-form";
import { QueueActions } from "./queue-actions";

const ZONE_LABEL: Record<string, string> = {
  any: "أي مكان",
  inside: "الداخل",
  outside: "الخارج",
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Shell>
        <p className="text-[color:var(--muted)]">
          يجب تسجيل الدخول.{" "}
          <Link href="/login" className="font-bold text-brand-600">تسجيل الدخول</Link>
        </p>
      </Shell>
    );
  }

  const { data: staffRows } = await supabase
    .from("staff")
    .select("id, role, restaurants(id, name, slug)")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1);

  const restaurant = staffRows?.[0]?.restaurants;

  if (!restaurant) {
    return (
      <Shell email={user.email}>
        <CreateRestaurantForm />
      </Shell>
    );
  }

  const { data: branches } = await supabase
    .from("branches")
    .select("id, name")
    .eq("restaurant_id", restaurant.id)
    .order("created_at");

  const branchIds = (branches ?? []).map((b) => b.id);

  const { data: queue } = branchIds.length
    ? await supabase
        .from("waitlist_entries")
        .select("id, position, party_size, zone, status, customers(full_name, phone)")
        .in("branch_id", branchIds)
        .in("status", ["waiting", "notified"])
        .order("position", { nullsFirst: false })
    : { data: [] };

  const list = queue ?? [];
  const inside = list.filter((q) => q.zone === "inside").length;
  const outside = list.filter((q) => q.zone === "outside").length;

  return (
    <Shell email={user.email} title={restaurant.name} slug={restaurant.slug}>
      {/* عدّادات */}
      <div className="mx-auto -mt-8 grid max-w-3xl grid-cols-3 gap-3 px-5">
        <Stat label="في الطابور" value={list.length} />
        <Stat label="الداخل" value={inside} />
        <Stat label="الخارج" value={outside} />
      </div>

      <div className="mx-auto max-w-3xl px-5 pt-5">
        <Link href="/dashboard/manage" className="btn btn-cream w-full">
          ✏️ إدارة المطعم والمنيو والصور
        </Link>
      </div>

      <div className="mx-auto max-w-3xl px-5 py-6">
        <h2 className="mb-4 text-lg font-extrabold text-brand-800 dark:text-cream-100">
          قائمة الانتظار الآن
        </h2>
        {list.length > 0 ? (
          <ul className="space-y-2">
            {list.map((q) => (
              <li key={q.id} className="soft-card flex items-center gap-3 p-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-lg font-extrabold text-white">
                  {q.position ?? "•"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{q.customers?.full_name ?? "عميل"}</p>
                  <p className="text-sm text-[color:var(--muted)]">
                    {q.party_size} أشخاص · {ZONE_LABEL[q.zone] ?? q.zone}
                    {q.status === "notified" ? " · أُشعِر" : ""}
                  </p>
                </div>
                <QueueActions id={q.id} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="soft-card flex flex-col items-center gap-2 py-12 text-center">
            <span className="text-4xl">🎉</span>
            <p className="text-sm text-[color:var(--muted)]">لا أحد في قائمة الانتظار حاليًا</p>
          </div>
        )}
      </div>
    </Shell>
  );
}

function Shell({
  children,
  email,
  title,
  slug,
}: {
  children: React.ReactNode;
  email?: string;
  title?: string;
  slug?: string;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="app-header px-5 pb-12 pt-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 3a9 9 0 1 0 9 9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                <circle cx="12" cy="12" r="3" fill="currentColor" />
              </svg>
            </span>
            <span className="text-lg font-extrabold">دور</span>
          </Link>
          <div className="flex items-center gap-2">
            {slug && (
              <Link href={`/r/${slug}`} className="icon-btn" title="الصفحة العامة">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M14 3h7v7M21 3l-9 9M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            )}
            <LogoutButton />
          </div>
        </div>
        {title && (
          <div className="mx-auto mt-6 max-w-3xl">
            <p className="text-sm text-cream-200/80">لوحة التحكم</p>
            <h1 className="text-2xl font-extrabold">{title}</h1>
          </div>
        )}
        {!title && email && (
          <p className="mx-auto mt-4 max-w-3xl text-sm text-cream-200/80" dir="ltr">{email}</p>
        )}
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="soft-card p-4 text-center">
      <p className="text-3xl font-extrabold text-brand-700 dark:text-brand-300">{value}</p>
      <p className="text-xs text-[color:var(--muted)]">{label}</p>
    </div>
  );
}
