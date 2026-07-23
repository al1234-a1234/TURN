import { redirect } from "next/navigation";
import { ImageUploader } from "@/components/image-uploader";
import { updateRestaurantInfo, updateBranchSettings, addBranch, deleteBranch } from "./actions";
import { MenuManager } from "./menu-manager";
import { loadOwner } from "../owner-context";
import { ColumnChart, SplitBars, ChartCard } from "./charts";
import { toAr } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { staffHasPermission } from "@/lib/features";

const AR_DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const EN_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function ManagePage() {
  const lang = await getLang();
  const load = await loadOwner();
  if (load.state !== "ok") return null;
  const { supabase, restaurant: base, role, permissions } = load.ctx;
  // بوابة الصلاحية: صفحة الإدارة تعدّل إعدادات المطعم والمنيو → تتطلب صلاحية «الإعدادات»
  if (!staffHasPermission(role, permissions, "settings")) redirect("/dashboard");

  const { data: full } = await supabase
    .from("restaurants")
    .select("id, name, slug, description, logo_url, cover_url")
    .eq("id", base.id)
    .maybeSingle();
  const restaurant = full ?? { ...base, description: null, logo_url: null, cover_url: null };

  const [{ data: categories }, { data: items }, { data: branchList }, { data: reviewRows }] = await Promise.all([
    supabase.from("menu_categories").select("id, name").eq("restaurant_id", restaurant.id).order("sort_order").order("created_at"),
    supabase.from("menu_items").select("id, name, price, description, image_url, category_id").eq("restaurant_id", restaurant.id).order("created_at"),
    supabase.from("branches").select("id, name, city, address").eq("restaurant_id", restaurant.id).order("created_at"),
    supabase.from("reviews").select("rating").eq("restaurant_id", restaurant.id),
  ]);

  // متوسط تقييم حقيقي من جدول reviews (لا رقم ثابت)
  const ratings = (reviewRows ?? []).map((r) => Number(r.rating)).filter((n) => Number.isFinite(n) && n > 0);
  const avgRating = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : null;

  const firstBranch = branchList?.[0];
  const branchIds = (branchList ?? []).map((b) => b.id);

  const { data: settings } = firstBranch
    ? await supabase.from("branch_settings").select("accepts_waitlist, accepts_reservations, max_party_size, opening_hours").eq("branch_id", firstBranch.id).maybeSingle()
    : { data: null };
  const hours = (settings?.opening_hours ?? {}) as { open?: string; close?: string };

  // ===== تحليلات (آخر 30 يوم) =====
  const since30 = new Date(Date.now() - 30 * 864e5).toISOString();
  const { data: analytics } = branchIds.length
    ? await supabase.from("waitlist_entries").select("joined_at, seated_at, zone, status").in("branch_id", branchIds).gte("joined_at", since30)
    : { data: [] };
  const rows = analytics ?? [];

  // مخدومون آخر 7 أيام
  const now = new Date();
  const dayBuckets = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i));
    return { key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`, label: (lang === "en" ? EN_DAYS : AR_DAYS)[d.getDay()], value: 0 };
  });
  const bucketByKey = new Map(dayBuckets.map((b) => [b.key, b]));
  const seated = rows.filter((r) => r.status === "seated" && r.seated_at);
  for (const r of seated) {
    const d = new Date(r.seated_at as string);
    const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const b = bucketByKey.get(k);
    if (b) b.value += 1;
  }

  // ساعات الذروة (نوافذ ساعتين 12م→12ص)
  const hourWindows = [12, 14, 16, 18, 20, 22];
  const hourLabels = ["12", "2", "4", "6", "8", "10"];
  const peak = hourWindows.map((h, i) => ({ label: hourLabels[i], value: 0 }));
  for (const r of rows) {
    const hr = new Date(r.joined_at).getHours();
    const idx = hourWindows.findIndex((w) => hr >= w && hr < w + 2);
    if (idx >= 0) peak[idx].value += 1;
  }

  // توزيع الطابور الحالي داخلي/خارجي — استعلام حيّ بلا حدّ زمني (يطابق الاستقبال والنظرة العامة)
  const { data: liveRows } = branchIds.length
    ? await supabase.from("waitlist_entries").select("zone").in("branch_id", branchIds).in("status", ["waiting", "notified"])
    : { data: [] as { zone: string }[] };
  const live = (liveRows ?? []) as { zone: string }[];
  const waiting = live;
  const insideNow = live.filter((r) => r.zone === "inside").length;
  const outsideNow = live.filter((r) => r.zone === "outside").length;

  // مؤشرات
  const served30 = seated.length;
  const waits = seated
    .map((r) => (r.seated_at ? (new Date(r.seated_at).getTime() - new Date(r.joined_at).getTime()) / 60000 : null))
    .filter((n): n is number => n != null && n >= 0);
  const avgWait = waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : 0;

  const inputDark = "rounded-2xl border p-3";

  return (
    <div className="space-y-6">
        {/* ===== التحليلات ===== */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label={tr(lang, "خدمناهم (30 يوم)", "Served (30 days)")} value={toAr(served30)} tone="var(--st-open)" />
          <Kpi label={tr(lang, "متوسط الانتظار", "Avg. wait")} value={`${toAr(avgWait)} ${tr(lang, "د", "min")}`} tone="var(--brand-d)" />
          <Kpi label={tr(lang, "بالطابور الآن", "In queue now")} value={toAr(waiting.length)} tone="var(--st-full)" />
          <Kpi label={tr(lang, "التقييم", "Rating")} value={avgRating ?? tr(lang, "—", "—")} tone="var(--star)" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ChartCard title={tr(lang, "المخدومون آخر 7 أيام", "Served in the last 7 days")} hint={tr(lang, "عدد", "count")}>
            <ColumnChart data={dayBuckets} color="var(--brand)" />
          </ChartCard>
          <ChartCard title={tr(lang, "ساعات الذروة", "Peak hours")} hint={tr(lang, "مساءً", "PM")}>
            <ColumnChart data={peak} color="var(--st-full)" />
          </ChartCard>
        </div>
        <ChartCard title={tr(lang, "توزيع الطابور الآن", "Current queue split")} hint={tr(lang, "داخلي مقابل خارجي", "inside vs. outside")}>
          <SplitBars
            rows={[
              { label: tr(lang, "طاولات داخلية", "Indoor tables"), value: insideNow, color: "var(--st-full)" },
              { label: tr(lang, "طاولات خارجية", "Outdoor tables"), value: outsideNow, color: "var(--brand)" },
            ]}
          />
        </ChartCard>

        {/* ===== معلومات وصور المطعم ===== */}
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
            <div>
              <label className="field-label">{tr(lang, "الوصف", "Description")}</label>
              <textarea name="description" rows={3} defaultValue={restaurant.description ?? ""} className="field-input" placeholder={tr(lang, "نبذة عن المطعم…", "About the restaurant…")} />
            </div>
            <button className="btn btn-primary w-full">{tr(lang, "حفظ المعلومات", "Save info")}</button>
          </form>
        </section>

        {/* ===== الفروع والمواقع ===== */}
        <section className="soft-card p-5">
          <h2 className="mb-4 font-display text-lg font-bold text-[color:var(--ink)]">{tr(lang, "الفروع والمواقع", "Branches & locations")}</h2>
          <ul className="mb-4 space-y-2">
            {(branchList ?? []).map((b) => (
              <li key={b.id} className={`${inputDark} flex items-center gap-3`} style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[color:var(--sage)] text-brand-700">📍</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-[color:var(--ink)]">{b.name}</p>
                  <p className="truncate text-xs text-[color:var(--muted)]">{[b.city, b.address].filter(Boolean).join(" · ") || "—"}</p>
                </div>
                {(branchList ?? []).length > 1 && (
                  <form action={deleteBranch}>
                    <input type="hidden" name="branch_id" value={b.id} />
                    <button className="rounded-lg px-2 py-1 text-xs font-bold text-[color:var(--muted)] transition hover:text-red-600">{tr(lang, "حذف", "Delete")}</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          <form action={addBranch} className="space-y-3 rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
            <div className="grid gap-3 sm:grid-cols-3">
              <input name="name" required placeholder={tr(lang, "اسم الفرع", "Branch name")} className="field-input" />
              <input name="city" placeholder={tr(lang, "المدينة", "City")} className="field-input" />
              <input name="address" placeholder={tr(lang, "العنوان", "Address")} className="field-input" />
            </div>
            <button className="btn btn-secondary w-full">{tr(lang, "+ إضافة فرع", "+ Add branch")}</button>
          </form>
        </section>

        {/* ===== الإعدادات وأوقات العمل ===== */}
        <section className="soft-card p-5">
          <h2 className="mb-4 font-display text-lg font-bold text-[color:var(--ink)]">{tr(lang, "الإعدادات وأوقات العمل", "Settings & hours")}</h2>
          <form action={updateBranchSettings} className="space-y-4">
            {firstBranch && <input type="hidden" name="branch_id" value={firstBranch.id} />}
            <label className="flex items-center justify-between rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
              <span>
                <span className="block font-bold text-[color:var(--ink)]">{tr(lang, "استقبال قائمة الانتظار", "Accept waitlist")}</span>
                <span className="text-xs text-[color:var(--muted)]">{tr(lang, "أوقفها لإغلاق الطابور مؤقتًا أمام العملاء", "Turn off to temporarily close the queue to customers")}</span>
              </span>
              <input type="checkbox" name="accepts_waitlist" defaultChecked={settings?.accepts_waitlist ?? true} className="h-6 w-6 accent-[#a3341a]" />
            </label>
            <label className="flex items-center justify-between rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
              <span>
                <span className="block font-bold text-[color:var(--ink)]">{tr(lang, "استقبال الحجوزات", "Accept reservations")}</span>
                <span className="text-xs text-[color:var(--muted)]">{tr(lang, "فعّل الحجز المسبق للطاولات — منفصل عن طابور الحضور", "Enable advance table booking — separate from the walk-in queue")}</span>
              </span>
              <input type="checkbox" name="accepts_reservations" defaultChecked={settings?.accepts_reservations ?? false} className="h-6 w-6 accent-[#a3341a]" />
            </label>
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
          <MenuManager restaurantId={restaurant.id} categories={categories ?? []} items={items ?? []} />
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
