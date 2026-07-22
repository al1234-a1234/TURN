import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ImageUploader } from "@/components/image-uploader";
import { updateRestaurantInfo, updateBranchSettings, addBranch, deleteBranch } from "./actions";
import { MenuManager } from "./menu-manager";
import { OwnerHeader, OwnerTabs } from "../owner-chrome";
import { ColumnChart, SplitBars, ChartCard } from "./charts";
import { toAr } from "@/lib/format";

const AR_DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export default async function ManagePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/partners?redirect=/dashboard/manage");

  const { data: staffRows } = await supabase
    .from("staff")
    .select("restaurants(id, name, slug, description, logo_url, cover_url)")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1);

  const restaurant = staffRows?.[0]?.restaurants as
    | { id: string; name: string; slug: string; description: string | null; logo_url: string | null; cover_url: string | null }
    | undefined;
  if (!restaurant) redirect("/dashboard");

  const [{ data: categories }, { data: items }, { data: branchList }] = await Promise.all([
    supabase.from("menu_categories").select("id, name").eq("restaurant_id", restaurant.id).order("sort_order").order("created_at"),
    supabase.from("menu_items").select("id, name, price, description, image_url, category_id").eq("restaurant_id", restaurant.id).order("created_at"),
    supabase.from("branches").select("id, name, city, address").eq("restaurant_id", restaurant.id).order("created_at"),
  ]);

  const firstBranch = branchList?.[0];
  const branchIds = (branchList ?? []).map((b) => b.id);

  const { data: settings } = firstBranch
    ? await supabase.from("branch_settings").select("accepts_waitlist, max_party_size, opening_hours").eq("branch_id", firstBranch.id).maybeSingle()
    : { data: null };
  const hours = (settings?.opening_hours ?? {}) as { open?: string; close?: string };

  // ===== تحليلات (آخر ٣٠ يوم) =====
  const since30 = new Date(Date.now() - 30 * 864e5).toISOString();
  const { data: analytics } = branchIds.length
    ? await supabase.from("waitlist_entries").select("joined_at, seated_at, zone, status").in("branch_id", branchIds).gte("joined_at", since30)
    : { data: [] };
  const rows = analytics ?? [];

  // مخدومون آخر ٧ أيام
  const now = new Date();
  const dayBuckets = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i));
    return { key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`, label: AR_DAYS[d.getDay()], value: 0 };
  });
  const bucketByKey = new Map(dayBuckets.map((b) => [b.key, b]));
  const seated = rows.filter((r) => r.status === "seated" && r.seated_at);
  for (const r of seated) {
    const d = new Date(r.seated_at as string);
    const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const b = bucketByKey.get(k);
    if (b) b.value += 1;
  }

  // ساعات الذروة (نوافذ ساعتين ١٢م→١٢ص)
  const hourWindows = [12, 14, 16, 18, 20, 22];
  const hourLabels = ["١٢", "٢", "٤", "٦", "٨", "١٠"];
  const peak = hourWindows.map((h, i) => ({ label: hourLabels[i], value: 0 }));
  for (const r of rows) {
    const hr = new Date(r.joined_at).getHours();
    const idx = hourWindows.findIndex((w) => hr >= w && hr < w + 2);
    if (idx >= 0) peak[idx].value += 1;
  }

  // توزيع الطابور الحالي داخلي/خارجي
  const waiting = rows.filter((r) => r.status === "waiting" || r.status === "notified");
  const insideNow = waiting.filter((r) => r.zone === "inside").length;
  const outsideNow = waiting.filter((r) => r.zone === "outside").length;

  // مؤشرات
  const served30 = seated.length;
  const waits = seated
    .map((r) => (r.seated_at ? (new Date(r.seated_at).getTime() - new Date(r.joined_at).getTime()) / 60000 : null))
    .filter((n): n is number => n != null && n >= 0);
  const avgWait = waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : 0;

  const inputDark = "rounded-2xl border p-3";

  return (
    <div className="flex flex-1 flex-col">
      <OwnerHeader title={restaurant.name} slug={restaurant.slug} />
      <main className="mx-auto -mt-8 w-full max-w-3xl flex-1 space-y-6 px-5 pb-16">
        <OwnerTabs active="manage" />

        {/* ===== التحليلات ===== */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="خدمناهم (٣٠ يوم)" value={toAr(served30)} tone="var(--st-open)" />
          <Kpi label="متوسط الانتظار" value={`${toAr(avgWait)} د`} tone="var(--brand-d)" />
          <Kpi label="بالطابور الآن" value={toAr(waiting.length)} tone="var(--st-full)" />
          <Kpi label="التقييم" value="٤٫٩" tone="var(--star)" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ChartCard title="المخدومون آخر ٧ أيام" hint="عدد">
            <ColumnChart data={dayBuckets} color="var(--brand)" />
          </ChartCard>
          <ChartCard title="ساعات الذروة" hint="مساءً">
            <ColumnChart data={peak} color="var(--st-full)" />
          </ChartCard>
        </div>
        <ChartCard title="توزيع الطابور الآن" hint="داخلي مقابل خارجي">
          <SplitBars
            rows={[
              { label: "طاولات داخلية", value: insideNow, color: "var(--st-full)" },
              { label: "طاولات خارجية", value: outsideNow, color: "var(--brand)" },
            ]}
          />
        </ChartCard>

        {/* ===== معلومات وصور المطعم ===== */}
        <section className="soft-card p-5">
          <h2 className="mb-4 font-display text-lg font-bold text-[color:var(--ink)]">معلومات المطعم والصور</h2>
          <form action={updateRestaurantInfo} className="space-y-4">
            <div className="flex flex-wrap gap-6">
              <ImageUploader restaurantId={restaurant.id} name="logo_url" label="الشعار" defaultUrl={restaurant.logo_url} shape="circle" />
              <div className="min-w-[220px] flex-1">
                <ImageUploader restaurantId={restaurant.id} name="cover_url" label="صورة الغلاف" defaultUrl={restaurant.cover_url} shape="wide" />
              </div>
            </div>
            <div>
              <label className="field-label">اسم المطعم</label>
              <input name="name" defaultValue={restaurant.name} className="field-input" />
            </div>
            <div>
              <label className="field-label">الوصف</label>
              <textarea name="description" rows={3} defaultValue={restaurant.description ?? ""} className="field-input" placeholder="نبذة عن المطعم…" />
            </div>
            <button className="btn btn-primary w-full">حفظ المعلومات</button>
          </form>
        </section>

        {/* ===== الفروع والمواقع ===== */}
        <section className="soft-card p-5">
          <h2 className="mb-4 font-display text-lg font-bold text-[color:var(--ink)]">الفروع والمواقع</h2>
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
                    <button className="rounded-lg px-2 py-1 text-xs font-bold text-[color:var(--muted)] transition hover:text-red-600">حذف</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          <form action={addBranch} className="space-y-3 rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
            <div className="grid gap-3 sm:grid-cols-3">
              <input name="name" required placeholder="اسم الفرع" className="field-input" />
              <input name="city" placeholder="المدينة" className="field-input" />
              <input name="address" placeholder="العنوان" className="field-input" />
            </div>
            <button className="btn btn-secondary w-full">+ إضافة فرع</button>
          </form>
        </section>

        {/* ===== الإعدادات وأوقات العمل ===== */}
        <section className="soft-card p-5">
          <h2 className="mb-4 font-display text-lg font-bold text-[color:var(--ink)]">الإعدادات وأوقات العمل</h2>
          <form action={updateBranchSettings} className="space-y-4">
            <label className="flex items-center justify-between rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
              <span>
                <span className="block font-bold text-[color:var(--ink)]">استقبال قائمة الانتظار</span>
                <span className="text-xs text-[color:var(--muted)]">أوقفها لإغلاق الطابور مؤقتًا أمام العملاء</span>
              </span>
              <input type="checkbox" name="accepts_waitlist" defaultChecked={settings?.accepts_waitlist ?? true} className="h-6 w-6 accent-[#a3341a]" />
            </label>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="field-label">فتح</label>
                <input type="time" name="open_time" defaultValue={hours.open ?? ""} className="field-input" />
              </div>
              <div>
                <label className="field-label">إغلاق</label>
                <input type="time" name="close_time" defaultValue={hours.close ?? ""} className="field-input" />
              </div>
              <div>
                <label className="field-label">أقصى عدد للمجموعة</label>
                <input name="max_party_size" inputMode="numeric" defaultValue={settings?.max_party_size ?? 20} className="field-input" />
              </div>
            </div>
            <button className="btn btn-primary w-full">حفظ الإعدادات</button>
          </form>
        </section>

        {/* ===== المنيو ===== */}
        <section>
          <h2 className="mb-4 font-display text-lg font-bold text-[color:var(--ink)]">المنيو والأسعار</h2>
          <MenuManager restaurantId={restaurant.id} categories={categories ?? []} items={items ?? []} />
        </section>
      </main>
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
