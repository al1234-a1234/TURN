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

function minutesSince(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

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
          <Link href="/login" className="font-bold text-[color:var(--gold-1)]">تسجيل الدخول</Link>
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
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl text-3xl" style={{ background: "linear-gradient(135deg,#e7d8b5,#c9a961)" }}>
              🍽️
            </span>
            <h1 className="font-serif text-3xl font-bold text-[color:var(--ink)]">
              لا يوجد مطعم مرتبط بحسابك
            </h1>
            <p className="max-w-sm text-sm text-[color:var(--muted)]">
              المطاعم تُضاف من قِبل فريق دور. إذا زُوّدت برمز تسليم خاص بمطعمك،
              أدخله لتصبح المالك وتدير كل شيء.
            </p>
            <Link href="/claim" className="btn btn-primary w-full max-w-xs">🔑 عندي رمز تسليم</Link>
            <a href="mailto:albraalaan@gmail.com" className="text-sm font-bold text-[color:var(--gold-1)]">
              أبي أضيف مطعمي — تواصل معنا
            </a>
            {isAdmin && (
              <Link href="/admin" className="btn btn-secondary mt-2 w-full max-w-xs">⚙️ لوحة الأدمِن</Link>
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

  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 864e5).toISOString();

  const [{ data: queue }, todayRes, weekRes, { data: seatedRows }] = branchIds.length
    ? await Promise.all([
        supabase
          .from("waitlist_entries")
          .select("id, position, party_size, zone, status, joined_at, customers(full_name, phone)")
          .in("branch_id", branchIds)
          .in("status", ["waiting", "notified"])
          .order("position", { nullsFirst: false }),
        supabase.from("waitlist_entries").select("id", { count: "exact", head: true })
          .in("branch_id", branchIds).eq("status", "seated").gte("seated_at", startToday),
        supabase.from("waitlist_entries").select("id", { count: "exact", head: true })
          .in("branch_id", branchIds).eq("status", "seated").gte("seated_at", weekAgo),
        supabase.from("waitlist_entries").select("joined_at, seated_at")
          .in("branch_id", branchIds).eq("status", "seated").gte("seated_at", weekAgo).not("seated_at", "is", null),
      ])
    : [{ data: [] }, { count: 0 }, { count: 0 }, { data: [] }];

  const list = queue ?? [];
  const servedToday = todayRes?.count ?? 0;
  const servedWeek = weekRes?.count ?? 0;

  const waits = (seatedRows ?? [])
    .map((r) => (r.seated_at && r.joined_at ? (new Date(r.seated_at).getTime() - new Date(r.joined_at).getTime()) / 60000 : null))
    .filter((n): n is number => n != null && n >= 0);
  const avgWait = waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : 0;

  const { data: isAdmin } = await supabase.rpc("is_platform_admin");

  return (
    <Shell email={user.email} title={restaurant.name} slug={restaurant.slug}>
      {/* لوحة الأرقام */}
      <div className="mx-auto grid max-w-3xl grid-cols-2 gap-3 px-5 sm:grid-cols-4">
        <Stat label="في الطابور الآن" value={list.length} gold />
        <Stat label="خدمناهم اليوم" value={servedToday} />
        <Stat label="هذا الأسبوع" value={servedWeek} />
        <Stat label="متوسط الانتظار" value={avgWait} suffix="د" />
      </div>

      <div className="mx-auto flex max-w-3xl flex-col gap-2 px-5 pt-5 sm:flex-row">
        <Link href="/dashboard/manage" className="btn btn-primary flex-1">
          ✦ إدارة المطعم والمنيو والصور والإعدادات
        </Link>
        {isAdmin && (
          <Link href="/admin" className="btn btn-secondary flex-1">⚙️ لوحة الأدمِن</Link>
        )}
      </div>

      <div className="mx-auto max-w-3xl px-5 py-6">
        <h2 className="mb-4 font-serif text-2xl font-bold text-[color:var(--ink)]">قائمة الانتظار المباشرة</h2>
        {list.length > 0 ? (
          <ul className="space-y-2.5">
            {list.map((q) => {
              const cust = Array.isArray(q.customers) ? q.customers[0] : q.customers;
              const waited = minutesSince(q.joined_at);
              return (
                <li key={q.id} className="soft-card flex items-center gap-3 p-3.5">
                  <span
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl font-serif text-xl font-bold text-[color:var(--bg)]"
                    style={{ background: "linear-gradient(135deg,#e7d8b5,#c9a961)" }}
                  >
                    {q.position ?? "•"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-[color:var(--ink)]">{cust?.full_name ?? "عميل"}</p>
                    <p className="text-sm text-[color:var(--muted)]" dir="ltr">
                      {cust?.phone ?? "—"}
                    </p>
                    <p className="mt-0.5 text-xs text-[color:var(--muted)]">
                      {q.party_size} أشخاص · {ZONE_LABEL[q.zone] ?? q.zone} · ⏱ {waited} دقيقة
                      {q.status === "notified" ? " · أُشعِر ✓" : ""}
                    </p>
                  </div>
                  <QueueActions
                    id={q.id}
                    name={cust?.full_name ?? "عميلنا"}
                    phone={cust?.phone ?? ""}
                    restaurant={restaurant.name}
                    position={q.position}
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="soft-card flex flex-col items-center gap-2 py-12 text-center">
            <span className="text-4xl">🌿</span>
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
            <p className="text-sm tracking-widest text-[color:var(--gold-1)]/80">لوحة المالك</p>
            <h1 className="font-serif text-3xl font-bold text-[color:var(--ink)]">{title}</h1>
          </div>
        )}
        {!title && email && (
          <p className="mx-auto mt-4 max-w-3xl text-sm text-[color:var(--muted)]" dir="ltr">{email}</p>
        )}
      </header>
      <main className="mx-auto -mt-6 w-full flex-1">{children}</main>
    </div>
  );
}

function Stat({ label, value, suffix, gold }: { label: string; value: number; suffix?: string; gold?: boolean }) {
  return (
    <div className="soft-card p-4 text-center">
      <p className={`font-serif text-4xl font-bold leading-none ${gold ? "text-gold" : "text-[color:var(--ink)]"}`}>
        {value}
        {suffix && <span className="mr-1 text-base font-normal text-[color:var(--muted)]">{suffix}</span>}
      </p>
      <p className="mt-1.5 text-xs text-[color:var(--muted)]">{label}</p>
    </div>
  );
}
