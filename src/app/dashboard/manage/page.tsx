import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ImageUploader } from "@/components/image-uploader";
import { updateRestaurantInfo, updateBranchSettings, addBranch, deleteBranch } from "./actions";
import { MenuManager } from "./menu-manager";

export default async function ManagePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/dashboard/manage");

  const { data: staffRows } = await supabase
    .from("staff")
    .select("restaurants(id, name, slug, description, logo_url, cover_url)")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1);

  const restaurant = staffRows?.[0]?.restaurants;
  if (!restaurant) redirect("/dashboard");

  const [{ data: categories }, { data: items }, { data: branchList }] = await Promise.all([
    supabase.from("menu_categories").select("id, name").eq("restaurant_id", restaurant.id).order("sort_order").order("created_at"),
    supabase.from("menu_items").select("id, name, price, description, image_url, category_id").eq("restaurant_id", restaurant.id).order("created_at"),
    supabase.from("branches").select("id, name, city, address").eq("restaurant_id", restaurant.id).order("created_at"),
  ]);

  const firstBranch = branchList?.[0];

  const { data: settings } = firstBranch
    ? await supabase.from("branch_settings").select("accepts_waitlist, max_party_size, opening_hours").eq("branch_id", firstBranch.id).maybeSingle()
    : { data: null };
  const hours = (settings?.opening_hours ?? {}) as { open?: string; close?: string };

  return (
    <div className="flex flex-1 flex-col">
      <header className="app-header px-5 pb-10 pt-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href="/dashboard" className="icon-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <span className="text-lg font-extrabold">إدارة المطعم</span>
          <Link href={`/r/${restaurant.slug}`} className="icon-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M14 3h7v7M21 3l-9 9M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
        <h1 className="mx-auto mt-4 max-w-3xl text-2xl font-extrabold">{restaurant.name}</h1>
      </header>

      <main className="mx-auto -mt-4 w-full max-w-3xl flex-1 space-y-6 px-5 pb-12">
        {/* معلومات وصور المطعم */}
        <section className="soft-card p-5">
          <h2 className="mb-4 text-lg font-extrabold text-brand-800 dark:text-cream-100">معلومات المطعم</h2>
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

        {/* الفروع والمواقع */}
        <section className="soft-card p-5">
          <h2 className="mb-4 font-serif text-xl font-bold text-[color:var(--ink)]">الفروع والمواقع</h2>
          <ul className="mb-4 space-y-2">
            {(branchList ?? []).map((b) => (
              <li key={b.id} className="flex items-center gap-3 rounded-2xl border border-[var(--hairline)] bg-[rgba(12,23,18,0.4)] p-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[rgba(201,169,97,0.15)] text-[color:var(--gold-1)]">📍</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-[color:var(--ink)]">{b.name}</p>
                  <p className="truncate text-xs text-[color:var(--muted)]">{[b.city, b.address].filter(Boolean).join(" · ") || "—"}</p>
                </div>
                {(branchList ?? []).length > 1 && (
                  <form action={deleteBranch}>
                    <input type="hidden" name="branch_id" value={b.id} />
                    <button className="rounded-lg px-2 py-1 text-xs font-bold text-[color:var(--muted)] transition hover:text-red-300">حذف</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          <form action={addBranch} className="space-y-3 rounded-2xl border border-[var(--hairline)] bg-[rgba(12,23,18,0.4)] p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <input name="name" required placeholder="اسم الفرع" className="field-input" />
              <input name="city" placeholder="المدينة" className="field-input" />
              <input name="address" placeholder="العنوان" className="field-input" />
            </div>
            <button className="btn btn-secondary w-full">+ إضافة فرع</button>
          </form>
        </section>

        {/* الإعدادات وأوقات العمل */}
        <section className="soft-card p-5">
          <h2 className="mb-4 font-serif text-xl font-bold text-[color:var(--ink)]">الإعدادات وأوقات العمل</h2>
          <form action={updateBranchSettings} className="space-y-4">
            <label className="flex items-center justify-between rounded-2xl border border-[var(--hairline)] bg-[rgba(12,23,18,0.4)] p-4">
              <span>
                <span className="block font-bold text-[color:var(--ink)]">استقبال قائمة الانتظار</span>
                <span className="text-xs text-[color:var(--muted)]">أوقفها لإغلاق الطابور مؤقتًا أمام العملاء</span>
              </span>
              <input type="checkbox" name="accepts_waitlist" defaultChecked={settings?.accepts_waitlist ?? true} className="h-6 w-6 accent-[#c9a961]" />
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

        {/* المنيو */}
        <section>
          <h2 className="mb-4 font-serif text-xl font-bold text-[color:var(--ink)]">المنيو</h2>
          <MenuManager restaurantId={restaurant.id} categories={categories ?? []} items={items ?? []} />
        </section>
      </main>
    </div>
  );
}
