import { redirect } from "next/navigation";
import Link from "next/link";
import { loadOwner } from "../owner-context";
import { isModuleOn, staffHasPermission } from "@/lib/features";
import { CustomerControls } from "./customer-controls";
import { toAr } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import type { Database } from "@/lib/supabase/database.types";

type Profile = Database["public"]["Tables"]["customer_restaurant"]["Row"] & {
  customers: { full_name: string; phone: string } | { full_name: string; phone: string }[] | null;
};

const TIER_META: Record<string, { label: string; color: string; bg: string }> = {
  vip: { label: "VIP", color: "#661c0a", bg: "#f8e9e3" },
  gold: { label: "ذهبي", color: "#8a6a12", bg: "#faf1d8" },
  silver: { label: "فضي", color: "#5b6470", bg: "#eef1f4" },
  regular: { label: "عادي", color: "var(--muted)", bg: "var(--surface-2)" },
};
const TIER_LABEL_EN: Record<string, string> = {
  vip: "VIP",
  gold: "Gold",
  silver: "Silver",
  regular: "Regular",
};

function fmtDate(iso: string | null, lang: "ar" | "en"): string {
  if (!iso) return "—";
  // أرقام لاتينية دائمًا؛ أسماء شهور عربية في الوضع العربي
  return new Date(iso).toLocaleDateString(lang === "en" ? "en-US" : "ar-SA-u-nu-latn", { day: "numeric", month: "short" });
}

export default async function CustomersPage() {
  const lang = await getLang();
  const load = await loadOwner();
  if (load.state !== "ok") return null;
  const { supabase, restaurant, modules, role, permissions } = load.ctx;

  if (!isModuleOn(modules, "crm") || !staffHasPermission(role, permissions, "customers")) {
    redirect("/dashboard");
  }

  const { data } = await supabase
    .from("customer_restaurant")
    .select("*, customers(full_name, phone)")
    .eq("restaurant_id", restaurant.id)
    .order("is_vip", { ascending: false })
    .order("visits", { ascending: false })
    .limit(200);

  const list = (data ?? []) as Profile[];
  const vips = list.filter((p) => p.is_vip).length;
  const totalVisits = list.reduce((a, p) => a + p.visits, 0);
  const avgVisits = list.length ? Math.round((totalVisits / list.length) * 10) / 10 : 0;

  return (
    <div className="space-y-6">
        <div className="grid grid-cols-3 gap-3">
          <Kpi label={tr(lang, "عملاؤك", "Your customers")} value={toAr(list.length)} tone="var(--brand-d)" />
          <Kpi label={tr(lang, "مميّزون (VIP)", "VIPs")} value={toAr(vips)} tone="var(--st-open)" />
          <Kpi label={tr(lang, "متوسط الزيارات", "Avg. visits")} value={toAr(avgVisits)} tone="var(--st-full)" />
        </div>

        <p className="text-sm text-[color:var(--muted)]">
          {tr(lang, "كل عميل زار مطعمك عبر دور — وصولك الكامل له: زياراته، شريحته، ووسمه كـVIP مع ملاحظاتك الخاصة.", "Every customer who visited your restaurant through Turn — full access: their visits, tier, VIP tag, and your private notes.")}
        </p>

        {list.length === 0 ? (
          <div className="soft-card py-10 text-center">
            <p className="text-2xl">👥</p>
            <p className="mt-2 font-bold text-[color:var(--ink)]">{tr(lang, "لا يوجد عملاء بعد", "No customers yet")}</p>
            <p className="mt-1 text-sm text-[color:var(--muted)]">{tr(lang, "تظهر الملفّات تلقائيًا عند إجلاس العملاء من الطابور.", "Profiles appear automatically when customers are seated from the queue.")}</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {list.map((p) => {
              const c = Array.isArray(p.customers) ? p.customers[0] : p.customers;
              const tm = TIER_META[p.tier] ?? TIER_META.regular;
              const name = c?.full_name ?? tr(lang, "عميل", "Customer");
              return (
                <li key={p.customer_id} className="soft-card p-4">
                  <Link href={`/dashboard/customers/${p.customer_id}`} className="flex items-center gap-3">
                    <span
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl font-display text-lg font-bold"
                      style={{ background: tm.bg, color: tm.color }}
                    >
                      {name.trim().charAt(0) || tr(lang, "؟", "?")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-bold text-[color:var(--ink)]">{name}</p>
                        {p.is_vip && <span className="rounded-full px-2 py-0.5 text-[10px] font-extrabold" style={{ background: "#f8e9e3", color: "#661c0a" }}>VIP</span>}
                        {p.is_blocked && <span className="rounded-full px-2 py-0.5 text-[10px] font-extrabold text-white" style={{ background: "var(--st-closed)" }}>{tr(lang, "محظور", "Blocked")}</span>}
                      </div>
                      <p className="text-sm text-[color:var(--muted)]" dir="ltr">{c?.phone ?? "—"}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[color:var(--muted)]">
                        <span className="rounded-full px-2 py-0.5 font-bold" style={{ background: tm.bg, color: tm.color }}>{tr(lang, tm.label, TIER_LABEL_EN[p.tier] ?? tm.label)}</span>
                        <span>{tr(lang, `${toAr(p.visits)} زيارة`, `${toAr(p.visits)} visits`)}</span>
                        <span>· {tr(lang, `آخر زيارة ${fmtDate(p.last_visit, "ar")}`, `Last visit ${fmtDate(p.last_visit, "en")}`)}</span>
                        {p.no_shows > 0 && <span className="text-[color:var(--st-closed)]">· {tr(lang, `${toAr(p.no_shows)} تغيّب`, `${toAr(p.no_shows)} no-shows`)}</span>}
                      </div>
                      {p.tags && p.tags.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {p.tags.map((t) => (
                            <span key={t} className="chip">{t}</span>
                          ))}
                        </div>
                      )}
                      {p.note && <p className="mt-1.5 rounded-xl bg-[color:var(--surface-2)] p-2 text-xs text-[color:var(--ink)]">📝 {p.note}</p>}
                    </div>
                  </Link>
                  <CustomerControls
                    customerId={p.customer_id}
                    isVip={p.is_vip}
                    tier={p.tier}
                    note={p.note}
                    visits={p.visits}
                  />
                </li>
              );
            })}
          </ul>
        )}
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
