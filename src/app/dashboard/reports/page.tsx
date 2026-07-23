import Link from "next/link";
import { redirect } from "next/navigation";
import { loadOwner } from "../owner-context";
import { ColumnChart, SplitBars, ChartCard } from "../manage/charts";
import { PrintButton } from "./print-button";
import { staffHasPermission } from "@/lib/features";
import { toAr } from "@/lib/format";
import { tr, pct, type Lang } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";

const AR_DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const EN_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const HOURS = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];

function hourLabel(h: number, lang: Lang): string {
  if (h === 12) return tr(lang, "12 م", "12 PM");
  if (h === 0) return tr(lang, "12 ص", "12 AM");
  if (h < 12) return `${toAr(h)} ${tr(lang, "ص", "AM")}`;
  return `${toAr(h - 12)} ${tr(lang, "م", "PM")}`;
}

const PERIODS = ["day", "week", "month", "year"] as const;
type Period = (typeof PERIODS)[number];

function periodLabel(p: Period, lang: Lang): string {
  switch (p) {
    case "day":
      return tr(lang, "يومي", "Daily");
    case "week":
      return tr(lang, "أسبوعي", "Weekly");
    case "month":
      return tr(lang, "شهري", "Monthly");
    case "year":
      return tr(lang, "سنوي", "Yearly");
  }
}

type WaitRow = {
  joined_at: string;
  seated_at: string | null;
  status: string;
  zone: string;
  party_size: number;
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: periodParam } = await searchParams;
  const period: Period = PERIODS.includes(periodParam as Period) ? (periodParam as Period) : "month";

  const lang = await getLang();
  const load = await loadOwner();
  if (load.state !== "ok") return null;

  const { supabase, restaurant, modules, role, permissions } = load.ctx;

  if (!staffHasPermission(role, permissions, "analytics")) redirect("/dashboard");

  const { data: branches } = await supabase
    .from("branches")
    .select("id, name")
    .eq("restaurant_id", restaurant.id)
    .order("created_at");
  const branchIds = (branches ?? []).map((b) => b.id);

  // ===== نافذة الفترة =====
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sinceDate =
    period === "day"
      ? startToday
      : period === "week"
        ? new Date(Date.now() - 7 * 864e5)
        : period === "month"
          ? new Date(Date.now() - 30 * 864e5)
          : new Date(Date.now() - 365 * 864e5);
  const since = sinceDate.toISOString();

  const [rev, profiles, analytics] = await Promise.all([
    supabase.from("reviews").select("rating").eq("restaurant_id", restaurant.id),
    supabase
      .from("customer_restaurant")
      .select("visits")
      .eq("restaurant_id", restaurant.id),
    branchIds.length
      ? supabase
          .from("waitlist_entries")
          .select("joined_at, seated_at, status, zone, party_size")
          .in("branch_id", branchIds)
          .gte("joined_at", since)
      : Promise.resolve({ data: [] as WaitRow[] }),
  ]);

  // ===== التقييم =====
  const ratings = (rev.data ?? []).map((r) => r.rating);
  const avgRating = ratings.length
    ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
    : 0;

  // ===== العملاء =====
  const profRows = (profiles.data ?? []) as { visits: number }[];
  const totalCustomers = profRows.length;
  const returning = profRows.filter((p) => p.visits >= 2).length;
  const returningPct = totalCustomers ? Math.round((returning / totalCustomers) * 100) : 0;

  // ===== الطابور والتحليلات (ضمن الفترة) =====
  const rows = (analytics.data ?? []) as WaitRow[];
  const seated = rows.filter((r) => r.status === "seated" && r.seated_at);
  const served = seated.length;
  const joined = rows.length;
  const noShow = rows.filter((r) => r.status === "no_show").length;
  const cancel = rows.filter((r) => r.status === "cancelled").length;
  const closed = served + noShow + cancel;
  const noShowRate = closed ? Math.round((noShow / closed) * 100) : 0;
  const cancelRate = closed ? Math.round((cancel / closed) * 100) : 0;

  const waits = seated
    .map((r) => (new Date(r.seated_at as string).getTime() - new Date(r.joined_at).getTime()) / 60000)
    .filter((n) => n >= 0 && n < 600);
  const avgWait = waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : 0;

  const partySizes = seated.map((r) => r.party_size).filter((n) => n > 0);
  const avgParty = partySizes.length
    ? Math.round((partySizes.reduce((a, b) => a + b, 0) / partySizes.length) * 10) / 10
    : 0;

  // توزيع حسب المنطقة (المخدومون ضمن الفترة)
  const insideServed = seated.filter((r) => r.zone === "inside").length;
  const outsideServed = seated.filter((r) => r.zone === "outside").length;

  // ساعات الذروة + أكثر الساعات ازدحامًا
  const byHour = new Map<number, number>();
  for (const r of rows) {
    const h = new Date(r.joined_at).getHours();
    byHour.set(h, (byHour.get(h) ?? 0) + 1);
  }
  const maxHour = Math.max(1, ...HOURS.map((h) => byHour.get(h) ?? 0));
  let busiestHour = -1;
  let busiestCount = 0;
  for (const [h, c] of byHour) {
    if (c > busiestCount) {
      busiestCount = c;
      busiestHour = h;
    }
  }
  const busiestLabel = busiestHour >= 0 ? hourLabel(busiestHour, lang) : "—";

  // ===== رسم التوزيع حسب الفترة =====
  let breakdown: { label: string; value: number }[];
  let breakdownTitle: string;
  if (period === "day") {
    const hourServed = new Map<number, number>();
    for (const r of seated) {
      const h = new Date(r.seated_at as string).getHours();
      hourServed.set(h, (hourServed.get(h) ?? 0) + 1);
    }
    breakdown = HOURS.map((h) => ({ label: hourLabel(h, lang), value: hourServed.get(h) ?? 0 }));
    breakdownTitle = tr(lang, "المخدومون حسب الساعة", "Served by hour");
  } else if (period === "week") {
    const dayBuckets = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i));
      return {
        key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
        label: tr(lang, AR_DAYS[d.getDay()], EN_DAYS[d.getDay()]),
        value: 0,
      };
    });
    const byKey = new Map(dayBuckets.map((b) => [b.key, b]));
    for (const r of seated) {
      const d = new Date(r.seated_at as string);
      const b = byKey.get(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
      if (b) b.value += 1;
    }
    breakdown = dayBuckets.map((b) => ({ label: b.label, value: b.value }));
    breakdownTitle = tr(lang, "المخدومون آخر 7 أيام", "Served in the last 7 days");
  } else if (period === "month") {
    const weekBuckets = Array.from({ length: 4 }, (_, i) => ({
      label: tr(lang, `أسبوع ${toAr(i + 1)}`, `Week ${i + 1}`),
      value: 0,
    }));
    for (const r of seated) {
      const daysAgo = Math.floor((now.getTime() - new Date(r.seated_at as string).getTime()) / 864e5);
      const idx = 3 - Math.min(3, Math.max(0, Math.floor(daysAgo / 7)));
      weekBuckets[idx].value += 1;
    }
    breakdown = weekBuckets;
    breakdownTitle = tr(lang, "المخدومون حسب الأسبوع", "Served by week");
  } else {
    const monthBuckets = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      return {
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: tr(lang, AR_MONTHS[d.getMonth()], EN_MONTHS[d.getMonth()]),
        value: 0,
      };
    });
    const byKey = new Map(monthBuckets.map((b) => [b.key, b]));
    for (const r of seated) {
      const d = new Date(r.seated_at as string);
      const b = byKey.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (b) b.value += 1;
    }
    breakdown = monthBuckets.map((b) => ({ label: b.label, value: b.value }));
    breakdownTitle = tr(lang, "المخدومون حسب الشهر", "Served by month");
  }

  const pLabel = periodLabel(period, lang);
  const generatedAt = now.toLocaleDateString(lang === "en" ? "en-US" : "ar-SA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <>
      {/* محدّد الفترة */}
      <div className="mb-5 flex flex-wrap gap-2 print:hidden">
        {PERIODS.map((p) => {
          const on = p === period;
          return (
            <Link
              key={p}
              href={`/dashboard/reports?period=${p}`}
              data-active={on}
              className="rounded-2xl px-4 py-2.5 text-sm font-bold transition data-[active=true]:text-white"
              style={on ? { background: "linear-gradient(160deg,#a8371a,#661c0a)" } : { background: "#fff", border: "1px solid var(--border)", color: "var(--muted)" }}
            >
              {periodLabel(p, lang)}
            </Link>
          );
        })}
      </div>

      {/* رأس التقرير */}
      <div className="soft-card mb-6 flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.2em] text-[color:var(--muted)]">
            {tr(lang, `تقرير الأداء — ${pLabel}`, `Performance report — ${pLabel}`)}
          </p>
          <h1 className="mt-1.5 font-display text-3xl font-bold text-[color:var(--ink)]">{restaurant.name}</h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            {tr(lang, `صدر بتاريخ ${generatedAt}`, `Generated on ${generatedAt}`)}
          </p>
        </div>
        <div className="print:hidden">
          <PrintButton />
        </div>
      </div>

      {/* المؤشرات */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={tr(lang, "خدمناهم", "Served")} value={toAr(served)} tone="var(--brand)" tint="#f8ece7" />
        <Kpi label={tr(lang, "انضموا للطابور", "Joined")} value={toAr(joined)} tone="var(--brand-d)" tint="#eef3fb" />
        <Kpi label={tr(lang, "متوسط الانتظار", "Average Wait")} value={`${toAr(avgWait)} ${tr(lang, "د", "min")}`} tone="var(--st-full)" tint="#fdf5e6" />
        <Kpi label={tr(lang, "متوسط المجموعة", "Average Party")} value={toAr(avgParty)} tone="var(--brand-d)" tint="#eef3fb" />
        <Kpi label={tr(lang, "أكثر الساعات ازدحامًا", "Busiest Hour")} value={busiestLabel} tone="var(--st-full)" tint="#fdf5e6" />
        <Kpi label={tr(lang, "متوسط التقييم", "Average Rating")} value={ratings.length ? `★ ${toAr(avgRating)}` : "—"} tone="var(--star)" tint="#fbf1e6" />
        <Kpi label={tr(lang, "إجمالي العملاء", "Total Customers")} value={toAr(totalCustomers)} tone="var(--brand-d)" tint="#f8e9e3" />
        <Kpi label={tr(lang, "عملاء عائدون", "Returning Customers")} value={pct(toAr(returningPct), lang)} tone="var(--st-open)" tint="#e9f4ee" />
        <Kpi label={tr(lang, "نسبة التغيّب", "No-show Rate")} value={pct(toAr(noShowRate), lang)} tone={noShowRate >= 20 ? "var(--st-closed)" : "var(--muted)"} tint="#f4eee6" />
        <Kpi label={tr(lang, "نسبة الإلغاء", "Cancel Rate")} value={pct(toAr(cancelRate), lang)} tone={cancelRate >= 20 ? "var(--st-closed)" : "var(--muted)"} tint="#f4eee6" />
      </div>

      {/* رسوم */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ChartCard title={breakdownTitle} hint={pLabel}>
          <ColumnChart data={breakdown} color="var(--brand)" />
        </ChartCard>
        <ChartCard title={tr(lang, "توزيع المخدومين حسب المنطقة", "Served by zone")} hint={pLabel}>
          <SplitBars
            rows={[
              { label: tr(lang, "طاولات داخلية", "Indoor tables"), value: insideServed, color: "var(--st-full)" },
              { label: tr(lang, "طاولات خارجية", "Outdoor tables"), value: outsideServed, color: "var(--brand)" },
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
