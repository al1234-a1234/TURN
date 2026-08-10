import Link from "next/link";
import { redirect } from "next/navigation";
import { IconPin } from "@/components/icons";
import { ImageUploader } from "@/components/image-uploader";
import { updateRestaurantInfo, updateBranchSettings, addBranch, deleteBranch } from "./actions";
import { MenuManager } from "./menu-manager";
import { loadOwner } from "../owner-context";
import { resolveBranchScope, NO_BRANCH } from "../branch-scope";
import { BranchPicker } from "../branch-picker";
import { ColumnChart, SplitBars, ChartCard } from "./charts";
import { toAr } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { riyadhDayStart, riyadhDayKey, riyadhWeekday, riyadhHour } from "@/lib/dates";
import { staffHasPermission } from "@/lib/features";

const LIVE_ZONE_TONES = ["var(--st-full)", "var(--brand)", "var(--st-open)", "var(--brand-d)", "var(--muted)"];

const AR_DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const EN_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function ManagePage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const lang = await getLang();
  const load = await loadOwner();
  if (load.state !== "ok") return null;
  const { supabase, restaurant: base, role, permissions } = load.ctx;
  // بوابة الصلاحية: صفحة الإدارة تعدّل إعدادات المطعم والمنيو → تتطلب صلاحية «الإعدادات»
  if (!staffHasPermission(role, permissions, "settings")) redirect("/dashboard");

  // الفرع النشِط ومعلومات المطعم الكاملة لا يعتمد أحدهما على نتيجة الآخر — يُجلبان معًا
  // بدل التسلسل (كل موجة انتظار شبكة إضافية بين خادم الموقع وفرانكفورت تُحسّ بطئًا حقيقيًّا).
  const [scope, { data: full }] = await Promise.all([
    resolveBranchScope(load.ctx, (await searchParams).branch),
    supabase
      .from("restaurants")
      .select("id, name, slug, description, logo_url, cover_url, cuisine, cuisine_en")
      .eq("id", base.id)
      .maybeSingle(),
  ]);
  const activeBranchId = scope.active?.id ?? "";
  const restaurant = full ?? { ...base, description: null, logo_url: null, cover_url: null, cuisine: null, cuisine_en: null };

  // فرع نشِط مفقود (حساب مربوط بفرع معطَّل) → لا نمرّر "" لعمود uuid فيفشل الاستعلام صامتًا
  const menuBranchId = activeBranchId || NO_BRANCH;

  const [{ data: categories }, { data: items }, { data: allBranches }, { data: reviewRows }] = await Promise.all([
    supabase.from("menu_categories").select("id, name, name_en").eq("branch_id", menuBranchId).order("sort_order").order("created_at"),
    supabase.from("menu_items").select("id, name, name_en, price, description, description_en, image_url, category_id").eq("branch_id", menuBranchId).order("created_at"),
    supabase.from("branches").select("id, name, city, address").eq("restaurant_id", restaurant.id).eq("is_active", true).order("created_at"),
    supabase.from("reviews").select("rating").eq("branch_id", menuBranchId),
  ]);

  // «المالك مالك» (0062): دور owner = مستوى العلامة كاملًا ولو كان حسابه
  // مربوطًا بفرع — الشعار والغلاف والتقييمات ملك صاحب المطعم. عزل
  // الفرانشايز يُحفظ بالأدوار: الشريك يُنشأ manager/host مربوطًا بفرعه.
  const isBrandLevel = load.ctx.branchId == null || role === "owner";
  const branchList = isBrandLevel
    ? (allBranches ?? [])
    : (allBranches ?? []).filter((b) => b.id === load.ctx.branchId);

  // متوسط تقييم حقيقي من جدول reviews (لا رقم ثابت)
  const ratings = (reviewRows ?? []).map((r) => Number(r.rating)).filter((n) => Number.isFinite(n) && n > 0);
  const avgRating = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : null;

  // الإعدادات تتبع الفرع المختار من المبدّل — لا الفرع الأقدم دائمًا،
  // وإلا أطفأ المالكُ طابورَ فرعٍ وهو يظنّ نفسه يعدّل فرعًا آخر.
  const settingsBranch = scope.active ?? branchList[0] ?? null;
  // التحليلات تتبع الفرع المختار أيضًا — مبدّل الفرع في الأعلى يحكم الصفحة كلها،
  // فلا تُعرض أرقام كل الفروع فوق إعدادات فرع واحد.
  const branchIds = settingsBranch ? [settingsBranch.id] : [];

  // ثلاثة استعلامات مستقلة (لا يحتاج أحدها نتيجة الآخر) — موجة واحدة بدل ثلاث
  const since30 = new Date(Date.now() - 30 * 864e5).toISOString();
  const [{ data: settings }, { data: analytics }, { data: liveRows }, tableCountRes] = await Promise.all([
    settingsBranch
      ? supabase.from("branch_settings").select("accepts_waitlist, accepts_reservations, max_party_size, opening_hours, default_duration_min, booking_window_days").eq("branch_id", settingsBranch.id).maybeSingle()
      : Promise.resolve({ data: null }),
    branchIds.length
      ? supabase.from("waitlist_entries").select("joined_at, seated_at, zone, status").in("branch_id", branchIds).gte("joined_at", since30)
      : Promise.resolve({ data: [] as { joined_at: string; seated_at: string | null; zone: string; status: string }[] }),
    branchIds.length
      ? supabase.from("waitlist_entries").select("zone").in("branch_id", branchIds).in("status", ["waiting", "notified"])
      : Promise.resolve({ data: [] as { zone: string }[] }),
    // الحجز يعيّن طاولةً بعينها؛ فرعٌ بلا طاولات لا يستطيع أن يحجز شيئًا
    settingsBranch
      ? supabase.from("tables").select("id", { count: "exact", head: true }).eq("branch_id", settingsBranch.id).eq("is_active", true)
      : Promise.resolve({ count: 0 }),
  ]);
  const tableCount = tableCountRes?.count ?? 0;
  const hours = (settings?.opening_hours ?? {}) as { open?: string; close?: string };
  const rows = analytics ?? [];

  // مخدومون آخر 7 أيام
  const dayBuckets = Array.from({ length: 7 }, (_, i) => {
    const d = riyadhDayStart(6 - i);
    return { key: riyadhDayKey(d), label: (lang === "en" ? EN_DAYS : AR_DAYS)[riyadhWeekday(d)], value: 0 };
  });
  const bucketByKey = new Map(dayBuckets.map((b) => [b.key, b]));
  const seated = rows.filter((r) => r.status === "seated" && r.seated_at);
  for (const r of seated) {
    const b = bucketByKey.get(riyadhDayKey(r.seated_at as string));
    if (b) b.value += 1;
  }

  // ساعات الذروة (نوافذ ساعتين 12م→12ص)
  const hourWindows = [12, 14, 16, 18, 20, 22];
  const hourLabels = ["12", "2", "4", "6", "8", "10"];
  const peak = hourWindows.map((h, i) => ({ label: hourLabels[i], value: 0 }));
  for (const r of rows) {
    const hr = riyadhHour(r.joined_at);
    const idx = hourWindows.findIndex((w) => hr >= w && hr < w + 2);
    if (idx >= 0) peak[idx].value += 1;
  }

  // توزيع الطابور الحالي داخلي/خارجي — استعلام حيّ بلا حدّ زمني (يطابق الاستقبال والنظرة العامة)
  // (جُلب أعلاه ضمن الموجة المتوازية مع الإعدادات والتحليلات)
  const live = (liveRows ?? []) as { zone: string }[];
  const waiting = live;
  // أسماء الأقسام للفروع المعروضة — المفتاح يجمعها والاسم يُعرض
  const { data: zoneRows } = branchIds.length
    ? await supabase.from("branch_zones").select("key, name").in("branch_id", branchIds).order("sort_order")
    : { data: [] as { key: string; name: string }[] };

  // توزيع الطابور الحيّ لكل قسم بأسماء المالك — لا عمودين مثبّتين
  const liveNames = new Map<string, string>();
  for (const z of zoneRows ?? []) if (!liveNames.has(z.key)) liveNames.set(z.key, z.name);
  const liveCounts = new Map<string, number>();
  for (const r of live) liveCounts.set(r.zone ?? "", (liveCounts.get(r.zone ?? "") ?? 0) + 1);
  const liveByZone = [...liveCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, value], i) => ({
      label: liveNames.get(key) ?? tr(lang, "بلا قسم", "No area"),
      value,
      color: LIVE_ZONE_TONES[i % LIVE_ZONE_TONES.length],
    }));

  // مؤشرات
  const served30 = seated.length;
  const waits = seated
    .map((r) => (r.seated_at ? (new Date(r.seated_at).getTime() - new Date(r.joined_at).getTime()) / 60000 : null))
    .filter((n): n is number => n != null && n >= 0 && n < 600); // نفس سقف الشواذ في اللوحة والتقارير
  const avgWait = waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : 0;

  const inputDark = "rounded-2xl border p-3";

  return (
    <div className="space-y-6">
      {scope.multi && scope.active && (
        <BranchPicker branches={scope.branches} activeId={scope.active.id} />
      )}
        {/* ===== التحليلات — للفرع المختار ===== */}
        {scope.multi && settingsBranch && (
          <p className="px-1 text-xs font-bold text-[color:var(--muted)]">
            {tr(lang, `الأرقام أدناه لفرع: ${settingsBranch.name}`, `Figures below are for branch: ${settingsBranch.name}`)}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label={tr(lang, "خدمناهم (30 يوم)", "Served (30 days)")} value={toAr(served30)} tone="var(--brand)" />
          <Kpi label={tr(lang, "متوسط الانتظار", "Avg. wait")} value={`${toAr(avgWait)} ${tr(lang, "د", "min")}`} tone="var(--brand-d)" />
          <Kpi label={tr(lang, "بالطابور الآن", "In queue now")} value={toAr(waiting.length)} tone="var(--brand-d)" />
          <Kpi label={tr(lang, "التقييم", "Rating")} value={avgRating ?? tr(lang, "—", "—")} tone="var(--star)" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ChartCard title={tr(lang, "المخدومون آخر 7 أيام", "Served in the last 7 days")} hint={tr(lang, "عدد", "count")}>
            <ColumnChart data={dayBuckets} color="var(--brand)" />
          </ChartCard>
          <ChartCard title={tr(lang, "ساعات الذروة", "Peak hours")} hint={tr(lang, "مساءً", "PM")}>
            <ColumnChart data={peak} color="var(--brand)" />
          </ChartCard>
        </div>
        <ChartCard title={tr(lang, "توزيع الطابور الآن", "Current queue split")} hint={tr(lang, "داخلي مقابل خارجي", "inside vs. outside")}>
          <SplitBars
            rows={[
              ...liveByZone,
            ]}
          />
        </ChartCard>

        {/* ===== معلومات وصور المطعم — هوية العلامة، لمالكها وحده ===== */}
        {!isBrandLevel ? (
          /* حساب فرع: بدل نصٍّ يتيم يوحي أن التحكم «اختفى» — خريطة كاملة
             لكل صورة يراها العميل: أين تُدار ومن أي شاشة، بروابط مباشرة. */
          <section className="soft-card p-5">
            <h2 className="mb-2 font-display text-lg font-bold text-[color:var(--ink)]">{tr(lang, "صور فرعك — تحكّمك الكامل", "Your branch images — full control")}</h2>
            <p className="mb-4 text-sm text-[color:var(--muted)]">
              {tr(lang,
                "كل صورة يراها العميل لها مكان إدارة واحد واضح:",
                "Every image your customer sees has one clear place to manage it:")}
            </p>
            <div className="space-y-2.5">
              <Link href="/dashboard/content" className="flex items-center justify-between rounded-2xl px-4 py-3.5 text-sm font-extrabold text-cream-100" style={{ background: "var(--brand-solid)" }}>
                <span>📸 {tr(lang, "صور الأجواء (معرض الفرع) — تظهر في صفحة مطعمك وتبويب ميديا", "Ambience photos (branch gallery) — shown on your page & Media tab")}</span>
                <span>←</span>
              </Link>
              <div className="flex items-center justify-between rounded-2xl px-4 py-3.5 text-sm font-extrabold" style={{ background: "var(--surface-2)", color: "var(--brand-d)" }}>
                <span>🍽️ {tr(lang, "صور أصناف القائمة — من قسم «القائمة» أسفل هذه الصفحة", "Menu item photos — in the Menu section further down this page")}</span>
                <span>↓</span>
              </div>
            </div>
            <p className="mt-4 rounded-2xl px-4 py-3 text-[13px] font-medium leading-relaxed" style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
              {tr(lang,
                "أما شعار العلامة وصورة الغلاف والاسم والوصف فهي مشتركة بين كل الفروع، ويديرها حساب مالك العلامة (الحساب غير المربوط بفرع) من هذه الشاشة نفسها.",
                "The brand logo, cover, name and description are shared across all branches and managed by the brand-owner account (the one not bound to a branch) from this same screen.")}
            </p>
          </section>
        ) : (
        <section className="soft-card p-5">
          <h2 className="mb-4 font-display text-lg font-bold text-[color:var(--ink)]">{tr(lang, "معلومات المطعم والصور", "Restaurant info & images")}</h2>
          <form action={updateRestaurantInfo} className="space-y-4">
            <div className="flex flex-wrap gap-6">
              <ImageUploader restaurantId={restaurant.id} name="logo_url" label={tr(lang, "الشعار", "Logo")} defaultUrl={restaurant.logo_url} shape="circle" />
              <div className="min-w-[220px] flex-1">
                <ImageUploader restaurantId={restaurant.id} name="cover_url" label={tr(lang, "صورة الغلاف", "Cover image")} defaultUrl={restaurant.cover_url} shape="wide" />
              </div>
            </div>
            <div>
              <label className="field-label">{tr(lang, "اسم المطعم", "Restaurant name")}</label>
              <input name="name" defaultValue={restaurant.name} className="field-input" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label">{tr(lang, "نوع المطبخ (عربي)", "Cuisine (Arabic)")}</label>
                <input name="cuisine" defaultValue={restaurant.cuisine ?? ""} className="field-input" placeholder={tr(lang, "مثال: إيطالي", "e.g. إيطالي")} />
              </div>
              <div>
                <label className="field-label">{tr(lang, "نوع المطبخ (إنجليزي)", "Cuisine (English)")}</label>
                <input name="cuisine_en" defaultValue={restaurant.cuisine_en ?? ""} className="field-input" placeholder="e.g. Italian" dir="ltr" />
              </div>
            </div>
            <div>
              <label className="field-label">{tr(lang, "الوصف", "Description")}</label>
              <textarea name="description" rows={3} defaultValue={restaurant.description ?? ""} className="field-input" placeholder={tr(lang, "نبذة عن المطعم…", "About the restaurant…")} />
            </div>
            <button className="btn btn-primary w-full">{tr(lang, "حفظ المعلومات", "Save info")}</button>
          </form>
        </section>
        )}

        {/* ===== الفروع والمواقع ===== */}
        <section className="soft-card p-5">
          <h2 className="mb-4 font-display text-lg font-bold text-[color:var(--ink)]">{tr(lang, "الفروع والمواقع", "Branches & locations")}</h2>
          <ul className="mb-4 space-y-2">
            {branchList.map((b) => (
              <li key={b.id} className={`${inputDark} flex items-center gap-3`} style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl text-cream-100" style={{ background: "var(--brand-solid)" }}><IconPin size={18} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-[color:var(--ink)]">{b.name}</p>
                  <p className="truncate text-xs text-[color:var(--muted)]">{[b.city, b.address].filter(Boolean).join(" · ") || "—"}</p>
                </div>
                {isBrandLevel && branchList.length > 1 && (
                  <form action={deleteBranch}>
                    <input type="hidden" name="branch_id" value={b.id} />
                    <button className="rounded-lg px-2 py-1 text-xs font-bold text-[color:var(--muted)] transition hover:text-[color:var(--danger)]">{tr(lang, "حذف", "Delete")}</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          {/* فتح فرع جديد قرار علامة — لا نعرض نموذجًا يفشل صامتًا على الفرانشايز */}
          {isBrandLevel && (
            <form action={addBranch} className="space-y-3 rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
              <div className="grid gap-3 sm:grid-cols-3">
                <input name="name" required placeholder={tr(lang, "اسم الفرع", "Branch name")} className="field-input" />
                <input name="city" placeholder={tr(lang, "المدينة", "City")} className="field-input" />
                <input name="address" placeholder={tr(lang, "العنوان", "Address")} className="field-input" />
              </div>
              <button className="btn btn-secondary w-full">{tr(lang, "+ إضافة فرع", "+ Add branch")}</button>
            </form>
          )}
        </section>

        {/* ===== الإعدادات وأوقات العمل ===== */}
        <section className="soft-card p-5">
          <h2 className="mb-1 font-display text-lg font-bold text-[color:var(--ink)]">{tr(lang, "الإعدادات وأوقات العمل", "Settings & hours")}</h2>
          <p className="mb-4 text-xs font-bold text-[color:var(--muted)]">
            {settingsBranch
              ? tr(lang, `تخصّ فرع: ${settingsBranch.name}`, `For branch: ${settingsBranch.name}`)
              : tr(lang, "لا يوجد فرع نشِط", "No active branch")}
          </p>
          <form action={updateBranchSettings} className="space-y-4">
            {settingsBranch && <input type="hidden" name="branch_id" value={settingsBranch.id} />}
            <label className="flex items-center justify-between rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
              <span>
                <span className="block font-bold text-[color:var(--ink)]">{tr(lang, "استقبال قائمة الانتظار", "Accept waitlist")}</span>
                <span className="text-xs text-[color:var(--muted)]">{tr(lang, "أوقفها لإغلاق الطابور مؤقتًا أمام العملاء", "Turn off to temporarily close the queue to customers")}</span>
              </span>
              <input type="checkbox" name="accepts_waitlist" defaultChecked={settings?.accepts_waitlist ?? true} className="h-6 w-6 accent-[var(--brand-solid)]" />
            </label>
            {/* الحجوزات: كتلةٌ واحدة — المفتاح ومدّة الجلسة ونافذة الحجز.
                مدّة الجلسة هي ما يحرّر الطاولة للحجز التالي، ونافذة الحجز هي
                أبعد يومٍ يُقبل. الاثنان يقرّران أيّ الأوقات تُعرض على العميل،
                فمكانهما تحت المفتاح لا في زاويةٍ أخرى من الصفحة. */}
            <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
              <label className="flex items-center justify-between gap-3">
                <span>
                  <span className="block font-bold text-[color:var(--ink)]">{tr(lang, "استقبال الحجوزات", "Accept reservations")}</span>
                  <span className="text-xs text-[color:var(--muted)]">{tr(lang, "فعّل الحجز المسبق للطاولات — منفصل عن طابور الحضور", "Enable advance table booking — separate from the walk-in queue")}</span>
                </span>
                <input
                  type="checkbox"
                  name="accepts_reservations"
                  defaultChecked={(settings?.accepts_reservations ?? false) && tableCount > 0}
                  disabled={tableCount === 0}
                  className="h-6 w-6 accent-[var(--brand-solid)] disabled:opacity-40"
                />
              </label>

              {/* حارس: الحجز يعيّن طاولةً بعينها. فرعٌ بلا طاولات كان يقبل
                  حجوزاتٍ لا تحجز شيئًا — والمالك لا يعرف أنه امتلأ. */}
              {tableCount === 0 ? (
                <p className="mt-3 rounded-xl px-3.5 py-3 text-xs font-bold leading-6" style={{ background: "var(--surface)", border: "1px solid rgba(156,59,38,0.35)", color: "var(--danger)" }}>
                  {tr(lang, "عرّف طاولات هذا الفرع أولًا — الحجز يخصّص طاولةً بعينها، وبلا طاولات لا يحجز شيئًا.", "Define this branch's tables first — a booking assigns a specific table, and with none it books nothing.")}
                  <Link href={`/dashboard/tables${settingsBranch ? `?branch=${settingsBranch.id}` : ""}`} className="ms-1.5 underline decoration-2 underline-offset-4">
                    {tr(lang, "أضف طاولات ←", "Add tables ←")}
                  </Link>
                </p>
              ) : (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="field-label">{tr(lang, "مدّة الجلسة (دقيقة)", "Seating duration (min)")}</label>
                    <input name="default_duration_min" inputMode="numeric" defaultValue={settings?.default_duration_min ?? 90} className="field-input" />
                    <p className="mt-1 text-[11px] font-medium text-[color:var(--muted)]">
                      {tr(lang, "بعدها تُعرض الطاولة شاغرةً للحجز التالي.", "After it, the table is offered to the next booking.")}
                    </p>
                  </div>
                  <div>
                    <label className="field-label">{tr(lang, "نافذة الحجز (يوم)", "Booking window (days)")}</label>
                    <input name="booking_window_days" inputMode="numeric" defaultValue={settings?.booking_window_days ?? 30} className="field-input" />
                    <p className="mt-1 text-[11px] font-medium text-[color:var(--muted)]">
                      {tr(lang, "أبعد يومٍ يستطيع العميل الحجز فيه.", "The furthest day a customer may book.")}
                    </p>
                  </div>
                </div>
              )}
            </div>
            {/* أقسام الجلوس صارت جدولًا يعرّفه المالك بأسمائه (branch_zones)،
                فلا معنى لمربّعَي «داخلي/خارجي» هنا. الإدارة تشير إلى موضعها
                الحقيقي بدل أن تحتفظ بنسخةٍ ثانيةٍ ناقصة منها. */}
            <Link
              href={`/dashboard/tables${settingsBranch ? `?branch=${settingsBranch.id}` : ""}`}
              className="flex items-center justify-between rounded-2xl border p-4"
              style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
            >
              <span className="text-[color:var(--muted)]">←</span>
              <span className="text-end">
                <span className="block font-bold text-[color:var(--ink)]">{tr(lang, "أقسام الجلوس والطاولات", "Seating areas & tables")}</span>
                <span className="text-xs text-[color:var(--muted)]">
                  {tr(lang, "سمِّ أقسامك كما تسمّيها — عوائل، أفراد، تراس — وعرّف طاولات كلٍّ منها", "Name your areas as you do — families, singles, terrace — and define each one's tables")}
                </span>
              </span>
            </Link>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="field-label">{tr(lang, "فتح", "Open")}</label>
                <input type="time" name="open_time" defaultValue={hours.open ?? ""} className="field-input" />
              </div>
              <div>
                <label className="field-label">{tr(lang, "إغلاق", "Close")}</label>
                <input type="time" name="close_time" defaultValue={hours.close ?? ""} className="field-input" />
              </div>
              <div>
                <label className="field-label">{tr(lang, "أقصى عدد للمجموعة", "Max party size")}</label>
                <input name="max_party_size" inputMode="numeric" defaultValue={settings?.max_party_size ?? 20} className="field-input" />
              </div>
            </div>
            <button className="btn btn-primary w-full">{tr(lang, "حفظ الإعدادات", "Save settings")}</button>
          </form>
        </section>

        {/* ===== المنيو ===== */}
        <section>
          <h2 className="mb-4 font-display text-lg font-bold text-[color:var(--ink)]">{tr(lang, "المنيو والأسعار", "Menu & prices")}</h2>
          <MenuManager restaurantId={restaurant.id} branchId={activeBranchId} categories={categories ?? []} items={items ?? []} />
        </section>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="soft-card p-4 text-center">
      <p className="font-display text-2xl font-bold leading-none" style={{ color: tone }}>{value}</p>
      <p className="mt-1.5 text-[11px] font-bold text-[color:var(--muted)]">{label}</p>
    </div>
  );
}
