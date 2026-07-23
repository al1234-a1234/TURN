import Link from "next/link";
import { OwnerShell } from "./owner-shell";
import { OwnerHeader } from "./owner-chrome";
import { loadOwner } from "./owner-context";
import { toAr } from "@/lib/format";

const HOURS = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
function hourLabel(h: number): string {
  if (h === 12) return "١٢ م";
  if (h < 12) return `${toAr(h)} ص`;
  return `${toAr(h - 12)} م`;
}

export default async function OverviewPage() {
  const load = await loadOwner();

  if (load.state === "no_user") {
    return (
      <div className="flex flex-1 flex-col">
        <OwnerHeader />
        <main className="mx-auto w-full max-w-3xl px-5 py-10">
          <p className="text-[color:var(--muted)]">
            يجب تسجيل الدخول.{" "}
            <Link href="/partners" className="font-bold text-brand-700">تسجيل الدخول</Link>
          </p>
        </main>
      </div>
    );
  }

  if (load.state === "no_restaurant") {
    return (
      <div className="flex flex-1 flex-col">
        <OwnerHeader email={load.email ?? undefined} />
        <main className="mx-auto max-w-xl px-5 py-10">
          <div className="soft-card flex flex-col items-center gap-4 p-8 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl text-3xl" style={{ background: "linear-gradient(160deg,#a8371a,#661c0a)" }}>🍽️</span>
            <h1 className="font-display text-2xl font-bold text-[color:var(--ink)]">لا يوجد مطعم مرتبط بحسابك</h1>
            <p className="max-w-sm text-sm text-[color:var(--muted)]">حسابات الملّاك تُنشأ من قِبل إدارة دور فقط. تواصل معنا لإضافة مطعمك.</p>
            <a href="mailto:albraalaan@gmail.com" className="btn btn-primary w-full max-w-xs">تواصل مع الإدارة</a>
            {load.isAdmin && <Link href="/admin" className="btn btn-secondary mt-2 w-full max-w-xs">⚙️ لوحة الأدمِن</Link>}
          </div>
        </main>
      </div>
    );
  }

  const { supabase, restaurant, modules, role, permissions } = load.ctx;

  const { data: branches } = await supabase.from("branches").select("id").eq("restaurant_id", restaurant.id);
  const branchIds = (branches ?? []).map((b) => b.id);

  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const since30 = new Date(Date.now() - 30 * 864e5).toISOString();

  const [rev, custCount, queueNow, analytics] = await Promise.all([
    supabase.from("reviews").select("rating").eq("restaurant_id", restaurant.id),
    supabase.from("customer_restaurant").select("customer_id", { count: "exact", head: true }).eq("restaurant_id", restaurant.id),
    branchIds.length
      ? supabase.from("waitlist_entries").select("id", { count: "exact", head: true }).in("branch_id", branchIds).in("status", ["waiting", "notified"])
      : Promise.resolve({ count: 0 }),
    branchIds.length
      ? supabase.from("waitlist_entries").select("joined_at, seated_at, status").in("branch_id", branchIds).gte("joined_at", since30)
      : Promise.resolve({ data: [] }),
  ]);

  const ratings = (rev.data ?? []).map((r) => r.rating);
  const avgRating = ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : 0;
  const totalCustomers = custCount.count ?? 0;
  const queueCount = queueNow.count ?? 0;

  const rows = (analytics.data ?? []) as { joined_at: string; seated_at: string | null; status: string }[];
  const seated = rows.filter((r) => r.status === "seated" && r.seated_at);
  const seatedToday = seated.filter((r) => new Date(r.seated_at as string) >= startToday).length;

  const waits = seated
    .map((r) => (new Date(r.seated_at as string).getTime() - new Date(r.joined_at).getTime()) / 60000)
    .filter((n) => n >= 0 && n < 600);
  const avgWait = waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : 0;

  // ساعات الذروة (نسبة كل ساعة من أعلى ساعة)
  const byHour = new Map<number, number>();
  for (const r of rows) byHour.set(new Date(r.joined_at).getHours(), (byHour.get(new Date(r.joined_at).getHours()) ?? 0) + 1);
  const maxHour = Math.max(1, ...HOURS.map((h) => byHour.get(h) ?? 0));

  return (
    <OwnerShell
      active="overview"
      restaurant={restaurant}
      modules={modules}
      role={role}
      permissions={permissions}
      counts={{ reception: queueCount, customers: totalCustomers, reviews: ratings.length }}
    >
      <div className="mb-6 hidden lg:block">
        <h1 className="font-display text-3xl font-bold text-[color:var(--ink)]">لوحة التحكم</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">نظرة عامة على أداء {restaurant.name}</p>
      </div>

      {/* المؤشرات الأربعة */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="متوسط التقييم" value={ratings.length ? `★ ${toAr(avgRating)}` : "—"} tone="var(--star)" tint="#fbf1e6" />
        <Kpi label="متوسط الانتظار" value={`${toAr(avgWait)} د`} tone="var(--st-full)" tint="#fdf5e6" />
        <Kpi label="جالسون اليوم" value={toAr(seatedToday)} tone="var(--st-open)" tint="#e9f4ee" />
        <Kpi label="إجمالي العملاء" value={toAr(totalCustomers)} tone="var(--brand-d)" tint="#eef3fb" />
      </div>

      {/* ساعات الذروة */}
      <section className="soft-card mt-6 p-5">
        <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold text-[color:var(--ink)]">
          <span className="h-4 w-1.5 rounded-full" style={{ background: "var(--brand)" }} /> ساعات الذروة
        </h2>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-[color:var(--muted)]">لا توجد بيانات كافية بعد.</p>
        ) : (
          <div className="space-y-2">
            {HOURS.map((h) => {
              const n = byHour.get(h) ?? 0;
              const pct = Math.round((n / maxHour) * 100);
              return (
                <div key={h} className="flex items-center gap-3">
                  <span className="w-12 shrink-0 text-xs font-bold text-[color:var(--muted)]">{hourLabel(h)}</span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(pct, 2)}%`, background: "linear-gradient(90deg,#b23c1d,#661c0a)" }} />
                  </div>
                  <span className="w-10 shrink-0 text-left text-xs font-bold" style={{ color: "var(--brand-d)" }}>٪{toAr(pct)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* اختصار الطابور الحالي */}
      <Link href="/dashboard/reception" className="soft-card mt-6 flex items-center justify-between p-5 transition hover:brightness-[0.99]">
        <div>
          <p className="font-display text-lg font-bold text-[color:var(--ink)]">الطابور الآن</p>
          <p className="text-sm text-[color:var(--muted)]">افتح شاشة الاستقبال لإدارة الطابور</p>
        </div>
        <span className="flex items-center gap-2">
          <span className="font-display text-3xl font-bold text-brand-700">{toAr(queueCount)}</span>
          <span className="text-[color:var(--muted)]">←</span>
        </span>
      </Link>
    </OwnerShell>
  );
}

function Kpi({ label, value, tone, tint }: { label: string; value: string; tone: string; tint: string }) {
  return (
    <div className="rounded-2xl p-4 text-center" style={{ background: tint, border: "1px solid var(--border)" }}>
      <p className="font-display text-2xl font-bold leading-none lg:text-3xl" style={{ color: tone }}>{value}</p>
      <p className="mt-1.5 text-[11px] font-bold text-[color:var(--muted)]">{label}</p>
    </div>
  );
}
