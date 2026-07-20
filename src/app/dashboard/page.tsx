import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/logout-button";
import { BrandLink } from "@/components/brand";
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
    const { data: isAdmin } = await supabase.rpc("is_platform_admin");
    return (
      <Shell email={user.email}>
        <div className="mx-auto max-w-xl px-5 py-10">
          <div className="soft-card flex flex-col items-center gap-4 p-8 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600 text-3xl text-white shadow-[var(--shadow-lift)]">
              🍽️
            </span>
            <h1 className="text-2xl font-extrabold text-brand-800 dark:text-cream-100">
              لا يوجد مطعم مرتبط بحسابك
            </h1>
            <p className="max-w-sm text-sm text-[color:var(--muted)]">
              المطاعم تُضاف من قِبل فريق دور. إذا زُوّدت برمز تسليم خاص بمطعمك،
              أدخله لتصبح المالك وتدير المنيو والصور والطابور.
            </p>
            <Link href="/claim" className="btn btn-primary w-full max-w-xs">
              🔑 عندي رمز تسليم
            </Link>
            <a
              href="mailto:albraalaan@gmail.com"
              className="text-sm font-bold text-brand-600 dark:text-brand-300"
            >
              أبي أضيف مطعمي — تواصل معنا
            </a>
            {isAdmin && (
              <Link href="/admin" className="btn btn-cream mt-2 w-full max-w-xs">
                ⚙️ لوحة الأدمِن
              </Link>
            )}
          </div>
        </div>
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

  const { data: isAdmin } = await supabase.rpc("is_platform_admin");

  return (
    <Shell email={user.email} title={restaurant.name} slug={restaurant.slug}>
      {/* عدّادات */}
      <div className="mx-auto -mt-8 grid max-w-3xl grid-cols-3 gap-3 px-5">
        <Stat label="في الطابور" value={list.length} />
        <Stat label="الداخل" value={inside} />
        <Stat label="الخارج" value={outside} />
      </div>

      <div className="mx-auto flex max-w-3xl flex-col gap-2 px-5 pt-5 sm:flex-row">
        <Link href="/dashboard/manage" className="btn btn-cream flex-1">
          ✏️ إدارة المطعم والمنيو والصور
        </Link>
        {isAdmin && (
          <Link href="/admin" className="btn btn-ghost flex-1">
            ⚙️ لوحة الأدمِن
          </Link>
        )}
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
          <BrandLink href="/dashboard" size={38} />
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
