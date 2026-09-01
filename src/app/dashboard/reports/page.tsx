import Link from "next/link";
import { redirect } from "next/navigation";
import { loadOwner, scopeBranchIds } from "../owner-context";

/** الأقسام مفتوحة العدد، فاللون يدور بدل أن يُثبَّت لاثنين. */
const REPORT_ZONE_TONES = ["var(--st-full)", "var(--brand)", "var(--st-open)", "var(--brand-d)", "var(--muted)"];
import { ColumnChart, SplitBars, ChartCard } from "../manage/charts";
import { PrintButton } from "./print-button";
import { isModuleOn, staffHasPermission } from "@/lib/features";
import { waitStats } from "@/lib/wait-stats";
import { toAr } from "@/lib/format";
import { tr, pct, type Lang } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { ScreenGuide } from "@/components/screen-guide";
import { riyadhHour, riyadhDayKey, riyadhWeekday, riyadhISODate, fmtDate } from "@/lib/dates";

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

import { PERIODS, type Period, resolveAnchor, reportWindow } from "./window";
import { PeriodNav } from "./period-nav";

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
  id: string;
  joined_at: string;
  seated_at: string | null;
  status: string;
  zone: string;
  party_size: number;
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; date?: string }>;
}) {
  const { period: periodParam, date: dateParam } = await searchParams;
  const period: Period = PERIODS.includes(periodParam as Period) ? (periodParam as Period) : "month";

  // مرساة التقرير: آخر يومٍ في النافذة. كانت الصفحة تحسب نوافذها من
  // `Date.now()` مباشرة، فلا سبيل للمالك إلى أمس ولا إلى أسبوعٍ مضى —
  // «عالق على اليوم» كما وصفه. المرساة تجعل النافذة قابلة للتحريك بلا
  // تغيير طولها.
  const todayKey = riyadhISODate();
  const anchor = resolveAnchor(dateParam, todayKey);

  const lang = await getLang();
  const load = await loadOwner();
  if (load.state !== "ok") return null;

  const { supabase, restaurant, modules, role, permissions } = load.ctx;

  if (!isModuleOn(modules, "analytics") || !staffHasPermission(role, permissions, "analytics")) redirect("/dashboard");

  const canCustomers = staffHasPermission(role, permissions, "customers");
  // تفصيل الإلغاء يقرأ queue_events، وسياسته تشترط صلاحية «الطابور» لا
  // «التحليلات». من يملك التقارير دون الطابور كان سيقرأ صفرًا يفهمه
  // «لا أحد ألغى» — فنسأل قبل الجلب، كما نفعل مع أرقام العملاء أعلاه.
  const canWaitlist = staffHasPermission(role, permissions, "waitlist");

  const { data: branches } = await supabase
    .from("branches")
    .select("id, name")
    .eq("restaurant_id", restaurant.id)
    .order("created_at");
  const branchIds = scopeBranchIds(load.ctx, (branches ?? []).map((b) => b.id));

  // ===== نافذة الفترة =====
  //
  // النافذة الآن محاذيةٌ لليوم ومنتهيةٌ عند المرساة، بدل نافذةٍ متدحرجة
  // معلّقة بـ`Date.now()`. فائدتان: التنقّل صار ممكنًا أصلًا، والأرقام
  // صارت تطابق الرسم تحتها — كان رسمُ «الأسبوع» يعرض ٧ أيامٍ كاملة بينما
  // تعدّ المؤشّرات فوقه ١٦٨ ساعةً متدحرجة، فيختلف مجموع الأعمدة عن الرقم.
  const now = new Date();
  const { anchorStart, anchorEnd, sinceDate, since, until } = reportWindow(period, anchor);

  const { data: zoneRows } = branchIds.length
    ? await supabase.from("branch_zones").select("key, name").in("branch_id", branchIds).order("sort_order")
    : { data: [] as { key: string; name: string }[] };

  const [rev, profiles, analytics] = await Promise.all([
    supabase.from("reviews").select("rating").eq("restaurant_id", restaurant.id),
    // التقارير محروسة بصلاحية «التحليلات»، وأرقام العملاء محروسة بصلاحية
    // «العملاء» — وهما لا تتلازمان. من يملك الأولى دون الثانية كان سيرى صفرًا
    // يقرؤه «لا عملاء لنا»، فنسأل قبل الجلب ونكتب السبب مكان الرقم.
    canCustomers
      ? supabase
          .from("customer_restaurant")
          // !inner: يقصر العملاء على من زار فروع المتصل (لا أرقام العلامة كلها)
          .select("visits, customers!inner(id)")
          .eq("restaurant_id", restaurant.id)
      : Promise.resolve({ data: [] as { visits: number }[] }),
    branchIds.length
      ? supabase
          .from("waitlist_entries")
          .select("id, joined_at, seated_at, status, zone, party_size")
          .in("branch_id", branchIds)
          .gte("joined_at", since)
          // الحدّ الأعلى جديد: بلا فالنافذة مفتوحةٌ إلى الأبد ويصير
          // «أمس» هو «أمس وما بعده» — أي نفس رقم اليوم.
          .lt("joined_at", until)
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

  // التعريف والسقف في `@/lib/wait-stats` — موضعٌ واحد لثلاث شاشات
  const wait = waitStats(seated);

  // ===== تفصيل الإلغاء: من الاستقبال أم من العميل؟ =====
  // القاعدة لا تحمل عمودًا يميّز «من ألغى» في waitlist_entries. المميّز
  // الوحيد هو queue_events.actor = auth.uid() لحظة التغيّر: موظّفٌ مسجَّل
  // الدخول ⇒ معرّفه، وضيفٌ يلغي من تذكرته ⇒ لا جلسة ⇒ NULL.
  //
  // لكنّ السجلّ بدأ يوم تفعيله لا يوم افتتاح المطعم، فما قبله لا مصدر له.
  // ولا نوزّع المجهول على المعلوم: نعرضه بندًا ثالثًا صريحًا «غير مسجَّل»،
  // لأن رقمًا ناقصًا يُقرأ كاملًا أسوأ من رقمٍ يقول عن نفسه إنه ناقص.
  const cancelledIds = rows.filter((r) => r.status === "cancelled").map((r) => r.id);
  const { data: cancelEvents } = canWaitlist && cancelledIds.length
    ? await supabase
        .from("queue_events")
        .select("entry_id, actor")
        .eq("kind", "cancelled")
        .in("entry_id", cancelledIds)
    : { data: [] as { entry_id: string; actor: string | null }[] };

  // الصفّ قد يُلغى ويُرجَع ويُلغى ثانيةً — فالحدث الواحد لكل صفّ لا أكثر.
  const cancelSource = new Map<string, boolean>();
  for (const e of (cancelEvents ?? []) as { entry_id: string; actor: string | null }[]) {
    if (!cancelSource.has(e.entry_id)) cancelSource.set(e.entry_id, e.actor !== null);
  }
  const cancelByStaff = [...cancelSource.values()].filter(Boolean).length;
  const cancelBySelf = cancelSource.size - cancelByStaff;
  const cancelUnlogged = Math.max(0, cancel - cancelSource.size);

  const partySizes = seated.map((r) => r.party_size).filter((n) => n > 0);
  const avgParty = partySizes.length
    ? Math.round((partySizes.reduce((a, b) => a + b, 0) / partySizes.length) * 10) / 10
    : 0;

  // توزيع حسب القسم (المخدومون ضمن الفترة) — بأسماء المالك لا باثنين
  // مثبّتين. الأقسام تُجمَع من كل فروع النطاق، فقد تسمّي فروعٌ أقسامها
  // بأسماءٍ مختلفة؛ المفتاح هو ما يجمعها، وأوّل اسمٍ وجدناه هو ما يُعرض.
  const zoneName = new Map<string, string>();
  for (const z of zoneRows ?? []) if (!zoneName.has(z.key)) zoneName.set(z.key, z.name);
  const servedByZone = new Map<string, number>();
  for (const r of seated) {
    const k = r.zone ?? "";
    servedByZone.set(k, (servedByZone.get(k) ?? 0) + 1);
  }
  const zoneBreakdown = [...servedByZone.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, value], i) => ({
      label: zoneName.get(key) ?? tr(lang, "بلا قسم", "No area"),
      value,
      color: REPORT_ZONE_TONES[i % REPORT_ZONE_TONES.length],
    }));

  // ساعات الذروة + أكثر الساعات ازدحامًا
  const byHour = new Map<number, number>();
  for (const r of rows) {
    const h = riyadhHour(r.joined_at);
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
      const h = riyadhHour(r.seated_at as string);
      hourServed.set(h, (hourServed.get(h) ?? 0) + 1);
    }
    breakdown = HOURS.map((h) => ({ label: hourLabel(h, lang), value: hourServed.get(h) ?? 0 }));
    breakdownTitle = tr(lang, "المخدومون حسب الساعة", "Served by hour");
  } else if (period === "week") {
    const dayBuckets = Array.from({ length: 7 }, (_, i) => {
      // ‏٦-i يومًا قبل المرساة، لا قبل اليوم — وإلّا بقي الرسم على هذا
      // الأسبوع بينما المؤشّرات فوقه تعدّ أسبوعًا مضى.
      const d = new Date(anchorStart.getTime() - (6 - i) * 864e5);
      return {
        key: riyadhDayKey(d),
        label: tr(lang, AR_DAYS[riyadhWeekday(d)], EN_DAYS[riyadhWeekday(d)]),
        value: 0,
      };
    });
    const byKey = new Map(dayBuckets.map((b) => [b.key, b]));
    for (const r of seated) {
      const b = byKey.get(riyadhDayKey(r.seated_at as string));
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
      const daysAgo = Math.floor((anchorEnd.getTime() - new Date(r.seated_at as string).getTime()) / 864e5);
      const idx = 3 - Math.min(3, Math.max(0, Math.floor(daysAgo / 7)));
      weekBuckets[idx].value += 1;
    }
    breakdown = weekBuckets;
    breakdownTitle = tr(lang, "المخدومون حسب الأسبوع", "Served by week");
  } else {
    // مفتاح الشهر بتوقيت الرياض (إزاحة +3 ثم قراءة UTC)
    const monthKey = (d: Date) => {
      const r = new Date(d.getTime() + 3 * 3600_000);
      return `${r.getUTCFullYear()}-${r.getUTCMonth()}`;
    };
    const nowR = new Date(anchorStart.getTime() + 3 * 3600_000);
    const monthBuckets = Array.from({ length: 12 }, (_, i) => {
      const m = new Date(Date.UTC(nowR.getUTCFullYear(), nowR.getUTCMonth() - (11 - i), 1));
      return {
        key: `${m.getUTCFullYear()}-${m.getUTCMonth()}`,
        label: tr(lang, AR_MONTHS[m.getUTCMonth()], EN_MONTHS[m.getUTCMonth()]),
        value: 0,
      };
    });
    const byKey = new Map(monthBuckets.map((b) => [b.key, b]));
    for (const r of seated) {
      const b = byKey.get(monthKey(new Date(r.seated_at as string)));
      if (b) b.value += 1;
    }
    breakdown = monthBuckets.map((b) => ({ label: b.label, value: b.value }));
    breakdownTitle = tr(lang, "المخدومون حسب الشهر", "Served by month");
  }

  const pLabel = periodLabel(period, lang);

  // خطوة التنقّل نفسها صارت داخل `PeriodNav`؛ يبقى هنا ما تحتاجه الصفحة:
  // رابطُ تبديل الفترة (يحمل المرساة معه) وعنوانُ النافذة للرأس المطبوع.
  const hrefFor = (p: Period, d: string) => `/dashboard/reports?period=${p}${d === todayKey ? "" : `&date=${d}`}`;

  // عنوان النافذة: يومٌ واحد يُسمّى بيومه، وما طال يُكتب مدًى «من — إلى».
  const windowLabel =
    period === "day"
      ? fmtDate(anchorStart.toISOString(), lang)
      : `${fmtDate(sinceDate.toISOString(), lang)} — ${fmtDate(anchorStart.toISOString(), lang)}`;

  const generatedAt = now.toLocaleDateString(lang === "en" ? "en-US" : "ar-SA", {
    timeZone: "Asia/Riyadh",
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
              // المرساة تُحمَل مع تبديل الفترة: من «يوم ١٢ أغسطس» إلى
              // «أسبوع» يعني الأسبوع المنتهي بذلك اليوم، لا أسبوع اليوم.
              href={hrefFor(p, anchor)}
              data-active={on}
              className="rounded-2xl px-4 py-2.5 text-sm font-bold transition data-[active=true]:text-cream-100"
              style={on ? { background: "var(--brand-solid)" } : { background: "var(--surface)", border: "1px solid var(--border)", color: "var(--muted)" }}
            >
              {periodLabel(p, lang)}
            </Link>
          );
        })}
      </div>

      <PeriodNav lang={lang} period={period} anchor={anchor} todayKey={todayKey} />

      {/* رأس التقرير */}
      <div className="soft-card mb-6 flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold text-[color:var(--muted)]">
            {tr(lang, `تقرير الأداء — ${pLabel}`, `Performance report — ${pLabel}`)}
          </p>
          <h1 className="mt-1.5 font-display text-3xl font-bold text-[color:var(--ink)]">{restaurant.name}</h1>
          {/* المدى في الرأس لا في شريط التنقّل وحده: الشريط `print:hidden`،
              فكان التقرير المطبوع لأمسٍ يخرج مطابقًا لتقرير اليوم بلا ما
              يميّزهما — ورقتان متطابقتان لفترتين مختلفتين. */}
          <p className="mt-1 text-sm font-bold text-[color:var(--brand-d)]">
            {tr(lang, `الفترة: ${windowLabel}`, `Period: ${windowLabel}`)}
          </p>
          <p className="mt-0.5 text-sm text-[color:var(--muted)]">
            {tr(lang, `صدر بتاريخ ${generatedAt}`, `Generated on ${generatedAt}`)}
          </p>
        </div>
        <div className="print:hidden">
          <PrintButton />
        </div>
      </div>
      <ScreenGuide
        lang={lang}
        anchor="owner"
        className="mb-6 print:hidden"
        lines={[
          tr(lang, "تقرير أداءٍ لفترةٍ تختارها: يوم أو أسبوع أو شهر أو سنة.", "A performance report for a period you pick: day, week, month or year."),
          tr(lang, "بالسهمين تتنقّل بين الفترات، وبحقل التاريخ تقفز إلى يومٍ بعينه.", "The arrows step between periods; the date field jumps straight to a day."),
          tr(lang, "«طباعة / حفظ PDF» يُخرج التقرير جاهزًا للمشاركة.", "“Print / Save PDF” turns the report into something you can share."),
          tr(lang, "عشرة أرقامٍ مع رسوم الفترة والأقسام وساعات الذروة.", "Ten figures, plus the period, area and peak-hour charts."),
        ]}
      />

      {/* المؤشرات */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={tr(lang, "خدمناهم", "Served")} value={toAr(served)} tone="var(--brand)" tint="rgba(120,30,12,0.08)" />
        <Kpi label={tr(lang, "انضموا للطابور", "Joined")} value={toAr(joined)} tone="var(--brand-d)" tint="rgba(120,30,12,0.05)" />
        {/* الاسم يقول ما يُقاس فعلًا، والوسيط يكشف الالتواء — وتقرير تلغرام
            (0176) يعرض الاثنين منذ إنشائه، فهذا توحيدٌ معه لا اختراع. */}
        <Kpi label={tr(lang, "من الانضمام حتى التجليس", "Join → seated")}
             value={`${toAr(wait.avg)} ${tr(lang, "د", "min")}`}
             tone="var(--st-full)" tint="rgba(169,114,30,0.10)"
             hint={wait.n
               ? tr(lang, `الوسيط ${toAr(wait.median)} د · يشمل زمن تسجيل الاستقبال`,
                          `Median ${wait.median} min · includes reception's logging time`)
               : tr(lang, "لا تجليس مسجَّل في هذه الفترة", "No seatings in this period")} />
        <Kpi label={tr(lang, "متوسط المجموعة", "Average Party")} value={toAr(avgParty)} tone="var(--brand-d)" tint="rgba(120,30,12,0.05)" />
        <Kpi label={tr(lang, "أكثر الساعات ازدحامًا", "Busiest Hour")} value={busiestLabel} tone="var(--st-full)" tint="rgba(169,114,30,0.10)" />
        <Kpi label={tr(lang, "متوسط التقييم", "Average Rating")} value={ratings.length ? `★ ${toAr(avgRating)}` : "—"} tone="var(--star)" tint="rgba(120,30,12,0.06)" />
        <Kpi label={tr(lang, "إجمالي العملاء", "Total Customers")}
             value={canCustomers ? toAr(totalCustomers) : tr(lang, "لا صلاحية", "No access")}
             tone="var(--brand-d)" tint="rgba(120,30,12,0.10)" />
        <Kpi label={tr(lang, "عملاء عائدون", "Returning Customers")}
             value={canCustomers ? pct(toAr(returningPct), lang) : tr(lang, "لا صلاحية", "No access")}
             tone="var(--st-open)" tint="rgba(63,125,93,0.10)" />
        <Kpi label={tr(lang, "نسبة التغيّب", "No-show Rate")} value={pct(toAr(noShowRate), lang)} tone={noShowRate >= 20 ? "var(--st-closed)" : "var(--muted)"} tint="var(--surface-2)"
             hint={tr(lang, "يتطلّب تفعيل زرّ «لم يحضر» في الاستقبال", "Needs the “No-show” button in reception")} />
        <Kpi label={tr(lang, "نسبة الإلغاء", "Cancel Rate")} value={pct(toAr(cancelRate), lang)} tone={cancelRate >= 20 ? "var(--st-closed)" : "var(--muted)"} tint="var(--surface-2)" />
      </div>

      {/* تفصيل الإلغاء — إضافةٌ بجانب الأرقام أعلاه، لا بديلٌ عنها */}
      {cancel > 0 ? (
        <section className="soft-card mt-6 p-5">
          <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-bold text-[color:var(--ink)]">
            <span className="h-4 w-1.5 rounded-full" style={{ background: "var(--brand-solid)" }} />
            {tr(lang, "من أين جاء الإلغاء؟", "Where did cancellations come from?")}
          </h2>
          <p className="mb-4 text-xs text-[color:var(--muted)]">
            {tr(lang, `من إجمالي ${toAr(cancel)} إلغاءً في هذه الفترة.`, `Out of ${toAr(cancel)} cancellations this period.`)}
          </p>
          {!canWaitlist ? (
            <p className="py-4 text-center text-sm text-[color:var(--muted)]">
              {tr(lang, "يتطلّب صلاحية «الطابور».", "Requires the “Queue” permission.")}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Kpi label={tr(lang, "أزالها الاستقبال", "Removed by reception")}
                   value={`${toAr(cancelByStaff)} · ${pct(toAr(cancel ? Math.round((cancelByStaff / cancel) * 100) : 0), lang)}`}
                   tone="var(--brand-d)" tint="rgba(120,30,12,0.05)" />
              <Kpi label={tr(lang, "ألغاها العميل بنفسه", "Cancelled by the guest")}
                   value={`${toAr(cancelBySelf)} · ${pct(toAr(cancel ? Math.round((cancelBySelf / cancel) * 100) : 0), lang)}`}
                   tone="var(--st-open)" tint="rgba(63,125,93,0.10)" />
              <Kpi label={tr(lang, "غير مسجَّل", "Not recorded")}
                   value={`${toAr(cancelUnlogged)} · ${pct(toAr(cancel ? Math.round((cancelUnlogged / cancel) * 100) : 0), lang)}`}
                   tone="var(--muted)" tint="var(--surface-2)"
                   hint={tr(lang, "إلغاءاتٌ سبقت تفعيل سجلّ الحركة", "Cancellations predating the activity log")} />
            </div>
          )}
        </section>
      ) : null}

      {/* رسوم */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ChartCard title={breakdownTitle} hint={pLabel}>
          <ColumnChart data={breakdown} color="var(--brand)" />
        </ChartCard>
        <ChartCard title={tr(lang, "توزيع المخدومين حسب المنطقة", "Served by zone")} hint={pLabel}>
          <SplitBars rows={zoneBreakdown} />
        </ChartCard>
      </div>

      {/* ساعات الذروة */}
      <section className="soft-card mt-6 p-5">
        <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold text-[color:var(--ink)]">
          <span className="h-4 w-1.5 rounded-full" style={{ background: "var(--brand-solid)" }} /> {tr(lang, "ساعات الذروة", "Peak Hours")}
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
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(barPct, 2)}%`, background: "var(--brand-solid)" }} />
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

function Kpi({ label, value, tone, tint, hint }: { label: string; value: string; tone: string; tint: string; hint?: string }) {
  return (
    <div className="rounded-2xl p-4 text-center" style={{ background: tint, border: "1px solid var(--border)" }}>
      <p className="font-display text-2xl font-bold leading-none lg:text-[1.75rem]" style={{ color: tone }}>{value}</p>
      <p className="mt-1.5 text-[11px] font-bold text-[color:var(--muted)]">{label}</p>
      {/* صفرٌ بلا تفسيرٍ يُقرأ نجاحًا. التلميح يقول لماذا هو صفر. */}
      {hint ? <p className="mt-1 text-[10px] leading-tight text-[color:var(--muted)] opacity-80">{hint}</p> : null}
    </div>
  );
}
