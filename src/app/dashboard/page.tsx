import Link from "next/link";
import { OwnerShell } from "./owner-shell";
import { OwnerHeader } from "./owner-chrome";
import { loadOwner } from "./owner-context";
import { ColumnChart, SplitBars, ChartCard } from "./manage/charts";
import { toAr } from "@/lib/format";

const AR_DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
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

  const { data: branches } = await supabase.from("branches").select("id, name").eq("restaurant_id", restaurant.id).order("created_at");
  const branchIds = (branches ?? []).map((b) => b.id);

  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const since30 = new Date(Date.now() - 30 * 864e5).toISOString();

  const [rev, profiles, analytics] = await Promise.all([
    supabase.from("reviews").select("rating").eq("restaurant_id", restaurant.id),
    supabase
      .from("customer_restaurant")
      .select("visits, is_vip, tier, points, customers(full_name)")
      .eq("restaurant_id", restaurant.id)
      .order("visits", { ascending: false }),
    branchIds.length
      ? supabase.from("waitlist_entries").select("joined_at, seated_at, status, zone, party_size").in("branch_id", branchIds).gte("joined_at", since30)
      : Promise.resolve({ data: [] as { joined_at: string; seated_at: string | null; status: string; zone: string; party_size: number }[] }),
  ]);

  // ===== التقييم =====
  const ratings = (rev.data ?? []).map((r) => r.rating);
  const avgRating = ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : 0;

  // ===== العملاء =====
  const profRows = (profiles.data ?? []) as { visits: number; is_vip: boolean; tier: string; points: number; customers: { full_name: string } | { full_name: string }[] | null }[];
  const totalCustomers = profRows.length;
  const returning = profRows.filter((p) => p.visits >= 2).length;
  const returningPct = totalCustomers ? Math.round((returning / totalCustomers) * 100) : 0;
  const vips = profRows.filter((p) => p.is_vip).length;
  const topCustomers = profRows.slice(0, 5);

  // ===== الطابور والتحليلات (٣٠ يوم) =====
  const rows = (analytics.data ?? []) as { joined_at: string; seated_at: string | null; status: string; zone: string; party_size: number }[];
  const seated = rows.filter((r) => r.status === "seated" && r.seated_at);
  const served30 = seated.length;
  const noShow30 = rows.filter((r) => r.status === "no_show").length;
  const cancel30 = rows.filter((r) => r.status === "cancelled").length;
  const closed = served30 + noShow30 + cancel30;
  const noShowRate = closed ? Math.round((noShow30 / closed) * 100) : 0;
  const seatedToday = seated.filter((r) => new Date(r.seated_at as string) >= startToday).length;

  const waits = seated
    .map((r) => (new Date(r.seated_at as string).getTime() - new Date(r.joined_at).getTime()) / 60000)
    .filter((n) => n >= 0 && n < 600);
  const avgWait = waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : 0;

  const partySizes = seated.map((r) => r.party_size).filter((n) => n > 0);
  const avgParty = partySizes.length ? Math.round((partySizes.reduce((a, b) => a + b, 0) / partySizes.length) * 10) / 10 : 0;

  // الطابور الآن
  const waitingNow = rows.filter((r) => r.status === "waiting" || r.status === "notified");
  const insideNow = waitingNow.filter((r) => r.zone === "inside").length;
  const outsideNow = waitingNow.filter((r) => r.zone === "outside").length;
  const queueCount = waitingNow.length;

  // مخدومون آخر ٧ أيام
  const dayBuckets = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i));
    return { key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`, label: AR_DAYS[d.getDay()], value: 0 };
  });
  const bucketByKey = new Map(dayBuckets.map((b) => [b.key, b]));
  for (const r of seated) {
    const d = new Date(r.seated_at as string);
    const b = bucketByKey.get(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    if (b) b.value += 1;
  }

  // ساعات الذروة
  const byHour = new Map<number, number>();
  for (const r of rows) byHour.set(new Date(r.joined_at).getHours(), (byHour.get(new Date(r.joined_at).getHours()) ?? 0) + 1);
  const maxHour = Math.max(1, ...HOURS.map((h) => byHour.get(h) ?? 0));

  // تنبيهات ذكية
  const alerts: { icon: string; text: string; tone: string }[] = [];
  if (queueCount >= 8) alerts.push({ icon: "🔥", text: `الطابور مزدحم الآن (${toAr(queueCount)} بالانتظار)`, tone: "var(--st-full)" });
  if (ratings.length >= 3 && avgRating < 4) alerts.push({ icon: "⚠️", text: `متوسط التقييم منخفض (${toAr(avgRating)}) — راجع التقييمات`, tone: "var(--st-closed)" });
  if (noShowRate >= 20) alerts.push({ icon: "📉", text: `نسبة التغيّب مرتفعة (٪${toAr(noShowRate)})`, tone: "var(--st-closed)" });

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
        <p className="mt-1 text-sm text-[color:var(--muted)]">نظرة شاملة على أداء {restaurant.name}</p>
      </div>

      {/* تنبيهات */}
      {alerts.length > 0 && (
        <div className="mb-5 space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className="flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold" style={{ background: "var(--surface)", border: `1px solid var(--border)`, color: a.tone }}>
              <span>{a.icon}</span> {a.text}
            </div>
          ))}
        </div>
      )}

      {/* المؤشرات (٨) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="متوسط التقييم" value={ratings.length ? `★ ${toAr(avgRating)}` : "—"} tone="var(--star)" tint="#fbf1e6" />
        <Kpi label="متوسط الانتظار" value={`${toAr(avgWait)} د`} tone="var(--st-full)" tint="#fdf5e6" />
        <Kpi label="جالسون اليوم" value={toAr(seatedToday)} tone="var(--st-open)" tint="#e9f4ee" />
        <Kpi label="إجمالي العملاء" value={toAr(totalCustomers)} tone="var(--brand-d)" tint="#eef3fb" />
        <Kpi label="خدمناهم (٣٠ يوم)" value={toAr(served30)} tone="var(--brand)" tint="#f8ece7" />
        <Kpi label="عملاء عائدون" value={`٪${toAr(returningPct)}`} tone="var(--st-open)" tint="#e9f4ee" />
        <Kpi label="عملاء مميّزون" value={toAr(vips)} tone="var(--brand-d)" tint="#f8e9e3" />
        <Kpi label="نسبة التغيّب" value={`٪${toAr(noShowRate)}`} tone={noShowRate >= 20 ? "var(--st-closed)" : "var(--muted)"} tint="#f4eee6" />
      </div>

      {/* رسوم */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ChartCard title="المخدومون آخر ٧ أيام" hint="عدد">
          <ColumnChart data={dayBuckets} color="var(--brand)" />
        </ChartCard>
        <ChartCard title="الطابور الآن" hint={`متوسط المجموعة ${toAr(avgParty)}`}>
          <SplitBars
            rows={[
              { label: "طاولات داخلية", value: insideNow, color: "var(--st-full)" },
              { label: "طاولات خارجية", value: outsideNow, color: "var(--brand)" },
            ]}
          />
        </ChartCard>
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

      {/* أبرز العملاء + اختصار الطابور */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="soft-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-[color:var(--ink)]">أبرز عملائك</h2>
            <Link href="/dashboard/customers" className="text-xs font-bold text-brand-700">الكل ←</Link>
          </div>
          {topCustomers.length === 0 ? (
            <p className="py-4 text-center text-sm text-[color:var(--muted)]">لا يوجد عملاء بعد.</p>
          ) : (
            <ul className="space-y-2">
              {topCustomers.map((p, i) => {
                const c = Array.isArray(p.customers) ? p.customers[0] : p.customers;
                return (
                  <li key={i} className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-display text-sm font-bold text-white" style={{ background: "linear-gradient(160deg,#a8371a,#661c0a)" }}>{toAr(i + 1)}</span>
                    <span className="min-w-0 flex-1 truncate font-bold text-[color:var(--ink)]">{c?.full_name ?? "عميل"}{p.is_vip ? " ⭐" : ""}</span>
                    <span className="text-sm font-bold text-[color:var(--muted)]">{toAr(p.visits)} زيارة</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <Link href="/dashboard/reception" className="soft-card flex items-center justify-between p-5 transition hover:brightness-[0.99]">
          <div>
            <p className="font-display text-lg font-bold text-[color:var(--ink)]">الطابور الآن</p>
            <p className="text-sm text-[color:var(--muted)]">افتح الاستقبال لإدارة الطابور</p>
          </div>
          <span className="flex items-center gap-2">
            <span className="font-display text-4xl font-bold text-brand-700">{toAr(queueCount)}</span>
            <span className="text-[color:var(--muted)]">←</span>
          </span>
        </Link>
      </div>
    </OwnerShell>
  );
}

function Kpi({ label, value, tone, tint }: { label: string; value: string; tone: string; tint: string }) {
  return (
    <div className="rounded-2xl p-4 text-center" style={{ background: tint, border: "1px solid var(--border)" }}>
      <p className="font-display text-2xl font-bold leading-none lg:text-[1.75rem]" style={{ color: tone }}>{value}</p>
      <p className="mt-1.5 text-[11px] font-bold text-[color:var(--muted)]">{label}</p>
    </div>
  );
}
