import Link from "next/link";
import { loadOwner } from "./owner-context";
import { ColumnChart, SplitBars, ChartCard } from "./manage/charts";
import { toAr } from "@/lib/format";
import { tr, pct, type Lang } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";

const AR_DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const EN_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
function hourLabel(h: number, lang: Lang): string {
  if (h === 12) return tr(lang, "12 م", "12 PM");
  if (h < 12) return `${toAr(h)} ${tr(lang, "ص", "AM")}`;
  return `${toAr(h - 12)} ${tr(lang, "م", "PM")}`;
}

export default async function OverviewPage() {
  const lang = await getLang();
  const load = await loadOwner();
  if (load.state !== "ok") return null;

  const { supabase, restaurant, modules, role, permissions } = load.ctx;

  const { data: branches } = await supabase.from("branches").select("id, name").eq("restaurant_id", restaurant.id).order("created_at");
  const branchIds = (branches ?? []).map((b) => b.id);

  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const since30 = new Date(Date.now() - 30 * 864e5).toISOString();

  const [rev, profiles, analytics, insightsRes] = await Promise.all([
    supabase.from("reviews").select("rating").eq("restaurant_id", restaurant.id),
    supabase
      .from("customer_restaurant")
      .select("visits, is_vip, tier, points, customers(full_name)")
      .eq("restaurant_id", restaurant.id)
      .order("visits", { ascending: false }),
    branchIds.length
      ? supabase.from("waitlist_entries").select("joined_at, seated_at, status, zone, party_size").in("branch_id", branchIds).gte("joined_at", since30)
      : Promise.resolve({ data: [] as { joined_at: string; seated_at: string | null; status: string; zone: string; party_size: number }[] }),
    supabase.from("owner_insights").select("id, kind, title, body, created_at").eq("restaurant_id", restaurant.id).order("created_at", { ascending: false }).limit(4),
  ]);

  const insights = (insightsRes.data ?? []) as { id: string; kind: string; title: string; body: string | null; created_at: string }[];
  const INSIGHT_ICON: Record<string, string> = { daily_digest: "📋", walkaway: "🏃", slow_hours: "🌙", smart_alert: "🔔" };

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

  // ===== الطابور والتحليلات (30 يوم) =====
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

  // مخدومون آخر 7 أيام
  const dayBuckets = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i));
    return { key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`, label: tr(lang, AR_DAYS[d.getDay()], EN_DAYS[d.getDay()]), value: 0 };
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
  if (queueCount >= 8) alerts.push({ icon: "🔥", text: tr(lang, `الطابور مزدحم الآن (${toAr(queueCount)} بالانتظار)`, `The queue is busy now (${toAr(queueCount)} waiting)`), tone: "var(--st-full)" });
  if (ratings.length >= 3 && avgRating < 4) alerts.push({ icon: "⚠️", text: tr(lang, `متوسط التقييم منخفض (${toAr(avgRating)}) — راجع التقييمات`, `Average rating is low (${toAr(avgRating)}) — review your ratings`), tone: "var(--st-closed)" });
  if (noShowRate >= 20) alerts.push({ icon: "📉", text: tr(lang, `نسبة التغيّب مرتفعة (٪${toAr(noShowRate)})`, `No-show rate is high (${toAr(noShowRate)}%)`), tone: "var(--st-closed)" });

  return (
    <>
      <div className="mb-6 hidden lg:block">
        <h1 className="font-display text-3xl font-bold text-[color:var(--ink)]">{tr(lang, "لوحة التحكم", "Dashboard")}</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">{tr(lang, `نظرة شاملة على أداء ${restaurant.name}`, `An overview of ${restaurant.name}'s performance`)}</p>
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

      {/* رؤى تلقائية (ملخّص يومي / منصرفون / عروض ركود) */}
      {insights.length > 0 && (
        <section className="soft-card mb-5 p-5">
          <h2 className="mb-3 font-display text-lg font-bold text-[color:var(--ink)]">{tr(lang, "رؤى وتنبيهات", "Insights & alerts")}</h2>
          <ul className="space-y-2.5">
            {insights.map((it) => (
              <li key={it.id} className="flex items-start gap-3">
                <span className="text-lg">{INSIGHT_ICON[it.kind] ?? "💡"}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-[color:var(--ink)]">{it.title}</p>
                  {it.body && <p className="text-sm text-[color:var(--muted)]">{it.body}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* المؤشرات (8) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={tr(lang, "متوسط التقييم", "Average Rating")} value={ratings.length ? `★ ${toAr(avgRating)}` : "—"} tone="var(--star)" tint="#fbf1e6" />
        <Kpi label={tr(lang, "متوسط الانتظار", "Average Wait")} value={`${toAr(avgWait)} ${tr(lang, "د", "min")}`} tone="var(--st-full)" tint="#fdf5e6" />
        <Kpi label={tr(lang, "جالسون اليوم", "Seated Today")} value={toAr(seatedToday)} tone="var(--st-open)" tint="#e9f4ee" />
        <Kpi label={tr(lang, "إجمالي العملاء", "Total Customers")} value={toAr(totalCustomers)} tone="var(--brand-d)" tint="#eef3fb" />
        <Kpi label={tr(lang, "خدمناهم (30 يوم)", "Served (30 days)")} value={toAr(served30)} tone="var(--brand)" tint="#f8ece7" />
        <Kpi label={tr(lang, "عملاء عائدون", "Returning Customers")} value={pct(toAr(returningPct), lang)} tone="var(--st-open)" tint="#e9f4ee" />
        <Kpi label={tr(lang, "عملاء مميّزون", "VIP Customers")} value={toAr(vips)} tone="var(--brand-d)" tint="#f8e9e3" />
        <Kpi label={tr(lang, "نسبة التغيّب", "No-show Rate")} value={pct(toAr(noShowRate), lang)} tone={noShowRate >= 20 ? "var(--st-closed)" : "var(--muted)"} tint="#f4eee6" />
      </div>

      {/* رسوم */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ChartCard title={tr(lang, "المخدومون آخر 7 أيام", "Served in the last 7 days")} hint={tr(lang, "عدد", "Count")}>
          <ColumnChart data={dayBuckets} color="var(--brand)" />
        </ChartCard>
        <ChartCard title={tr(lang, "الطابور الآن", "Queue Now")} hint={tr(lang, `متوسط المجموعة ${toAr(avgParty)}`, `Average party ${toAr(avgParty)}`)}>
          <SplitBars
            rows={[
              { label: tr(lang, "طاولات داخلية", "Indoor tables"), value: insideNow, color: "var(--st-full)" },
              { label: tr(lang, "طاولات خارجية", "Outdoor tables"), value: outsideNow, color: "var(--brand)" },
            ]}
          />
        </ChartCard>
      </div>

      {/* ساعات الذروة */}
      <section className="soft-card mt-6 p-5">
        <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold text-[color:var(--ink)]">
          <span className="h-4 w-1.5 rounded-full" style={{ background: "var(--brand)" }} /> {tr(lang, "ساعات الذروة", "Peak Hours")}
        </h2>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-[color:var(--muted)]">{tr(lang, "لا توجد بيانات كافية بعد.", "Not enough data yet.")}</p>
        ) : (
          <div className="space-y-2">
            {HOURS.map((h) => {
              const n = byHour.get(h) ?? 0;
              const barPct = Math.round((n / maxHour) * 100);
              return (
                <div key={h} className="flex items-center gap-3">
                  <span className="w-12 shrink-0 text-xs font-bold text-[color:var(--muted)]">{hourLabel(h, lang)}</span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(barPct, 2)}%`, background: "linear-gradient(90deg,#b23c1d,#661c0a)" }} />
                  </div>
                  <span className="w-10 shrink-0 text-left text-xs font-bold" style={{ color: "var(--brand-d)" }}>{pct(toAr(barPct), lang)}</span>
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
            <h2 className="font-display text-lg font-bold text-[color:var(--ink)]">{tr(lang, "أبرز عملائك", "Your Top Customers")}</h2>
            <Link href="/dashboard/customers" className="text-xs font-bold text-brand-700">{tr(lang, "الكل ←", "All ←")}</Link>
          </div>
          {topCustomers.length === 0 ? (
            <p className="py-4 text-center text-sm text-[color:var(--muted)]">{tr(lang, "لا يوجد عملاء بعد.", "No customers yet.")}</p>
          ) : (
            <ul className="space-y-2">
              {topCustomers.map((p, i) => {
                const c = Array.isArray(p.customers) ? p.customers[0] : p.customers;
                return (
                  <li key={i} className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-display text-sm font-bold text-white" style={{ background: "linear-gradient(160deg,#a8371a,#661c0a)" }}>{toAr(i + 1)}</span>
                    <span className="min-w-0 flex-1 truncate font-bold text-[color:var(--ink)]">{c?.full_name ?? tr(lang, "عميل", "Customer")}{p.is_vip ? " ⭐" : ""}</span>
                    <span className="text-sm font-bold text-[color:var(--muted)]">{toAr(p.visits)} {tr(lang, "زيارة", "visits")}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <Link href="/dashboard/reception" className="soft-card flex items-center justify-between p-5 transition hover:brightness-[0.99]">
          <div>
            <p className="font-display text-lg font-bold text-[color:var(--ink)]">{tr(lang, "الطابور الآن", "Queue Now")}</p>
            <p className="text-sm text-[color:var(--muted)]">{tr(lang, "افتح الاستقبال لإدارة الطابور", "Open reception to manage the queue")}</p>
          </div>
          <span className="flex items-center gap-2">
            <span className="font-display text-4xl font-bold text-brand-700">{toAr(queueCount)}</span>
            <span className="text-[color:var(--muted)]">←</span>
          </span>
        </Link>
      </div>
    </>
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
