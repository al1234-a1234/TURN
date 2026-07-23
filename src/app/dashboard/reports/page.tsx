import { redirect } from "next/navigation";
import { OwnerShell } from "../owner-shell";
import { loadOwner } from "../owner-context";
import { ColumnChart, SplitBars, ChartCard } from "../manage/charts";
import { PrintButton } from "./print-button";
import { staffHasPermission } from "@/lib/features";
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

export default async function ReportsPage() {
  const lang = await getLang();
  const load = await loadOwner();
  if (load.state !== "ok") redirect("/dashboard");

  const { supabase, restaurant, modules, role, permissions } = load.ctx;

  if (!staffHasPermission(role, permissions, "analytics")) redirect("/dashboard");

  const { data: branches } = await supabase
    .from("branches")
    .select("id, name")
    .eq("restaurant_id", restaurant.id)
    .order("created_at");
  const branchIds = (branches ?? []).map((b) => b.id);

  const now = new Date();
  const since30 = new Date(Date.now() - 30 * 864e5).toISOString();

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
          .gte("joined_at", since30)
      : Promise.resolve({
          data: [] as {
            joined_at: string;
            seated_at: string | null;
            status: string;
            zone: string;
            party_size: number;
          }[],
        }),
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

  // ===== الطابور والتحليلات (30 يوم) =====
  const rows = (analytics.data ?? []) as {
    joined_at: string;
    seated_at: string | null;
    status: string;
    zone: string;
    party_size: number;
  }[];
  const seated = rows.filter((r) => r.status === "seated" && r.seated_at);
  const served30 = seated.length;
  const noShow30 = rows.filter((r) => r.status === "no_show").length;
  const cancel30 = rows.filter((r) => r.status === "cancelled").length;
  const closed = served30 + noShow30 + cancel30;
  const noShowRate = closed ? Math.round((noShow30 / closed) * 100) : 0;
  const cancelRate = closed ? Math.round((cancel30 / closed) * 100) : 0;

  const waits = seated
    .map((r) => (new Date(r.seated_at as string).getTime() - new Date(r.joined_at).getTime()) / 60000)
    .filter((n) => n >= 0 && n < 600);
  const avgWait = waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : 0;

  const partySizes = seated.map((r) => r.party_size).filter((n) => n > 0);
  const avgParty = partySizes.length
    ? Math.round((partySizes.reduce((a, b) => a + b, 0) / partySizes.length) * 10) / 10
    : 0;

  // توزيع حسب المنطقة (المخدومون آخر 30 يوم)
  const insideServed = seated.filter((r) => r.zone === "inside").length;
  const outsideServed = seated.filter((r) => r.zone === "outside").length;

  // مخدومون آخر 7 أيام
  const dayBuckets = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i));
    return {
      key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
      label: tr(lang, AR_DAYS[d.getDay()], EN_DAYS[d.getDay()]),
      value: 0,
    };
  });
  const bucketByKey = new Map(dayBuckets.map((b) => [b.key, b]));
  for (const r of seated) {
    const d = new Date(r.seated_at as string);
    const b = bucketByKey.get(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    if (b) b.value += 1;
  }

  // ساعات الذروة
  const byHour = new Map<number, number>();
  for (const r of rows)
    byHour.set(new Date(r.joined_at).getHours(), (byHour.get(new Date(r.joined_at).getHours()) ?? 0) + 1);
  const maxHour = Math.max(1, ...HOURS.map((h) => byHour.get(h) ?? 0));

  const generatedAt = now.toLocaleDateString(lang === "en" ? "en-US" : "ar-SA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <OwnerShell active="reports" restaurant={restaurant} modules={modules} role={role} permissions={permissions}>
      {/* رأس التقرير */}
      <div className="soft-card mb-6 flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.2em] text-[color:var(--muted)]">
            {tr(lang, "تقرير الأداء — آخر 30 يومًا", "Performance report — last 30 days")}
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
        <Kpi label={tr(lang, "خدمناهم (30 يوم)", "Served (30 days)")} value={toAr(served30)} tone="var(--brand)" tint="#f8ece7" />
        <Kpi label={tr(lang, "متوسط الانتظار", "Average Wait")} value={`${toAr(avgWait)} ${tr(lang, "د", "min")}`} tone="var(--st-full)" tint="#fdf5e6" />
        <Kpi label={tr(lang, "متوسط المجموعة", "Average Party")} value={toAr(avgParty)} tone="var(--brand-d)" tint="#eef3fb" />
        <Kpi label={tr(lang, "متوسط التقييم", "Average Rating")} value={ratings.length ? `★ ${toAr(avgRating)}` : "—"} tone="var(--star)" tint="#fbf1e6" />
        <Kpi label={tr(lang, "إجمالي العملاء", "Total Customers")} value={toAr(totalCustomers)} tone="var(--brand-d)" tint="#f8e9e3" />
        <Kpi label={tr(lang, "عملاء عائدون", "Returning Customers")} value={pct(toAr(returningPct), lang)} tone="var(--st-open)" tint="#e9f4ee" />
        <Kpi label={tr(lang, "نسبة التغيّب", "No-show Rate")} value={pct(toAr(noShowRate), lang)} tone={noShowRate >= 20 ? "var(--st-closed)" : "var(--muted)"} tint="#f4eee6" />
        <Kpi label={tr(lang, "نسبة الإلغاء", "Cancel Rate")} value={pct(toAr(cancelRate), lang)} tone={cancelRate >= 20 ? "var(--st-closed)" : "var(--muted)"} tint="#f4eee6" />
      </div>

      {/* رسوم */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ChartCard title={tr(lang, "المخدومون آخر 7 أيام", "Served in the last 7 days")} hint={tr(lang, "عدد", "Count")}>
          <ColumnChart data={dayBuckets} color="var(--brand)" />
        </ChartCard>
        <ChartCard title={tr(lang, "توزيع المخدومين حسب المنطقة", "Served by zone")} hint={tr(lang, "آخر 30 يوم", "Last 30 days")}>
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
