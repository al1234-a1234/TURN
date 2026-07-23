import { redirect } from "next/navigation";
import { OwnerShell } from "../owner-shell";
import { loadOwner } from "../owner-context";
import { isModuleOn, staffHasPermission } from "@/lib/features";
import { saveLoyaltyProgram } from "./actions";
import { toAr } from "@/lib/format";
import type { Database } from "@/lib/supabase/database.types";

type Member = Database["public"]["Tables"]["customer_restaurant"]["Row"] & {
  customers: { full_name: string; phone: string } | { full_name: string; phone: string }[] | null;
};

export default async function LoyaltyPage() {
  const load = await loadOwner();
  if (load.state !== "ok") redirect("/dashboard");
  const { supabase, restaurant, modules, role, permissions } = load.ctx;

  if (!isModuleOn(modules, "loyalty") || !staffHasPermission(role, permissions, "loyalty")) {
    redirect("/dashboard");
  }

  const [{ data: program }, { data: members }] = await Promise.all([
    supabase.from("loyalty_programs").select("*").eq("restaurant_id", restaurant.id).maybeSingle(),
    supabase
      .from("customer_restaurant")
      .select("customer_id, points, visits, tier, customers(full_name, phone)")
      .eq("restaurant_id", restaurant.id)
      .gt("points", 0)
      .order("points", { ascending: false })
      .limit(20),
  ]);

  const active = program?.is_active ?? false;
  const perVisit = program?.points_per_visit ?? 1;
  const threshold = program?.reward_threshold ?? 10;
  const list = (members ?? []) as Member[];
  const readyToRedeem = list.filter((m) => m.points >= threshold).length;

  const field = "field-input";

  return (
    <OwnerShell active="loyalty" restaurant={restaurant} modules={modules} role={role} permissions={permissions}>
      <div className="space-y-6">
        <div className="grid grid-cols-3 gap-3">
          <Kpi label="الحالة" value={active ? "نشط" : "متوقّف"} tone={active ? "var(--st-open)" : "var(--muted)"} />
          <Kpi label="أعضاء بنقاط" value={toAr(list.length)} tone="var(--brand-d)" />
          <Kpi label="جاهزون للمكافأة" value={toAr(readyToRedeem)} tone="var(--st-full)" />
        </div>

        {/* إعداد البرنامج */}
        <section className="soft-card p-5">
          <h2 className="mb-1 font-display text-lg font-bold text-[color:var(--ink)]">برنامج الولاء</h2>
          <p className="mb-4 text-sm text-[color:var(--muted)]">نقاط لكل زيارة ومكافأة تُبقي العميل يرجع لك.</p>
          <form action={saveLoyaltyProgram} className="space-y-4">
            <label className="flex items-center justify-between rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
              <span>
                <span className="block font-bold text-[color:var(--ink)]">تفعيل البرنامج</span>
                <span className="text-xs text-[color:var(--muted)]">عند التفعيل تُحتسب النقاط تلقائيًا لكل عميل يُجلَس</span>
              </span>
              <input type="checkbox" name="is_active" defaultChecked={active} className="h-6 w-6 accent-[#a3341a]" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label">نقاط لكل زيارة</label>
                <input name="points_per_visit" inputMode="numeric" defaultValue={toAr(perVisit)} className={field} />
              </div>
              <div>
                <label className="field-label">نقاط المكافأة</label>
                <input name="reward_threshold" inputMode="numeric" defaultValue={toAr(threshold)} className={field} />
              </div>
            </div>
            <div>
              <label className="field-label">وصف المكافأة</label>
              <input name="reward_description" defaultValue={program?.reward_description ?? ""} placeholder="مثال: وجبة مجانية عند 10 نقاط" className={field} />
            </div>
            <button className="btn btn-primary w-full">حفظ البرنامج</button>
          </form>
        </section>

        {/* الأعضاء */}
        <section>
          <h2 className="mb-3 font-display text-lg font-bold text-[color:var(--ink)]">أعلى الأعضاء</h2>
          {list.length === 0 ? (
            <div className="soft-card py-10 text-center">
              <p className="text-2xl">⭐</p>
              <p className="mt-2 font-bold text-[color:var(--ink)]">لا توجد نقاط بعد</p>
              <p className="mt-1 text-sm text-[color:var(--muted)]">فعّل البرنامج لتبدأ النقاط بالتراكم مع كل زيارة.</p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {list.map((m, i) => {
                const c = Array.isArray(m.customers) ? m.customers[0] : m.customers;
                const ready = m.points >= threshold;
                return (
                  <li key={m.customer_id} className="soft-card flex items-center gap-3 p-3.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-display font-bold text-white" style={{ background: "linear-gradient(160deg,#a8371a,#661c0a)" }}>{toAr(i + 1)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-[color:var(--ink)]">{c?.full_name ?? "عميل"}</p>
                      <p className="text-xs text-[color:var(--muted)]">{toAr(m.visits)} زيارة</p>
                    </div>
                    <div className="text-left">
                      <p className="font-display text-xl font-bold text-brand-700">{toAr(m.points)}</p>
                      <p className="text-[10px] font-bold" style={{ color: ready ? "var(--st-open)" : "var(--muted)" }}>{ready ? "جاهز للمكافأة" : "نقطة"}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </OwnerShell>
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
