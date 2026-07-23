import Link from "next/link";
import { OwnerShell } from "./owner-shell";
import { OwnerHeader } from "./owner-chrome";
import { loadOwner } from "./owner-context";
import { getLang } from "@/lib/i18n-server";
import { tr } from "@/lib/i18n";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  const load = await loadOwner();

  if (load.state === "no_user") {
    return (
      <div className="flex flex-1 flex-col">
        <OwnerHeader />
        <main className="mx-auto w-full max-w-3xl px-5 py-10">
          <p className="text-[color:var(--muted)]">
            {tr(lang, "يجب تسجيل الدخول.", "You must sign in.")}{" "}
            <Link href="/partners" className="font-bold text-brand-700">{tr(lang, "تسجيل الدخول", "Sign in")}</Link>
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
            <h1 className="font-display text-2xl font-bold text-[color:var(--ink)]">{tr(lang, "لا يوجد مطعم مرتبط بحسابك", "No restaurant linked to your account")}</h1>
            <p className="max-w-sm text-sm text-[color:var(--muted)]">{tr(lang, "حسابات الملّاك تُنشأ من قِبل إدارة دور فقط. تواصل معنا لإضافة مطعمك.", "Owner accounts are created by the Turn team only. Contact us to add your restaurant.")}</p>
            <a href="mailto:albraalaan@gmail.com" className="btn btn-primary w-full max-w-xs">{tr(lang, "تواصل مع الإدارة", "Contact the team")}</a>
            {load.isAdmin && <Link href="/admin" className="btn btn-secondary mt-2 w-full max-w-xs">{tr(lang, "⚙️ لوحة الأدمِن", "⚙️ Admin panel")}</Link>}
          </div>
        </main>
      </div>
    );
  }

  const { supabase, restaurant, modules, role, permissions, isAdminView } = load.ctx;

  // عدّادات القائمة (تُحسب مرة مع القائمة الثابتة)
  const { data: branches } = await supabase.from("branches").select("id").eq("restaurant_id", restaurant.id);
  const branchIds = (branches ?? []).map((b) => b.id);

  const [queueRes, custRes, resvRes, revRes, staffRes] = await Promise.all([
    branchIds.length
      ? supabase.from("waitlist_entries").select("id", { count: "exact", head: true }).in("branch_id", branchIds).in("status", ["waiting", "notified"])
      : Promise.resolve({ count: 0 }),
    supabase.from("customer_restaurant").select("customer_id", { count: "exact", head: true }).eq("restaurant_id", restaurant.id),
    branchIds.length
      ? supabase.from("reservations").select("id", { count: "exact", head: true }).in("branch_id", branchIds).in("status", ["pending", "confirmed"])
      : Promise.resolve({ count: 0 }),
    supabase.from("reviews").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurant.id),
    supabase.from("staff").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurant.id).eq("is_active", true),
  ]);

  const counts = {
    reception: queueRes.count ?? 0,
    customers: custRes.count ?? 0,
    reservations: resvRes.count ?? 0,
    reviews: revRes.count ?? 0,
    staff: staffRes.count ?? 0,
  };

  return (
    <OwnerShell restaurant={restaurant} modules={modules} role={role} permissions={permissions} counts={counts} adminView={isAdminView}>
      {children}
    </OwnerShell>
  );
}
