import { redirect } from "next/navigation";
import Link from "next/link";
import { loadOwner } from "../owner-context";
import { isModuleOn, staffHasPermission } from "@/lib/features";
import { CustomerControls } from "./customer-controls";
import { CampaignForm } from "./campaign-form";
import { toAr, normalizePhone } from "@/lib/format";
import { daysAgoLabel } from "@/lib/dates";
import { tr } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import type { Database } from "@/lib/supabase/database.types";

type Profile = Database["public"]["Tables"]["customer_restaurant"]["Row"] & {
  customers: { full_name: string; phone: string } | { full_name: string; phone: string }[] | null;
};

const TIER_META: Record<string, { label: string; color: string; bg: string }> = {
  vip: { label: "VIP", color: "var(--brand-solid)", bg: "rgba(120,30,12,0.10)" },
  gold: { label: "ذهبي", color: "var(--star)", bg: "rgba(169,114,30,0.12)" },
  silver: { label: "فضي", color: "var(--muted)", bg: "rgba(120,30,12,0.05)" },
  regular: { label: "عادي", color: "var(--muted)", bg: "var(--surface-2)" },
};
const TIER_LABEL_EN: Record<string, string> = { vip: "VIP", gold: "Gold", silver: "Silver", regular: "Regular" };

// الشرائح المتاحة للفلترة — تجيب على أسئلة المالك الفعلية:
// من المميّز؟ من عنده هدية لم تُستخدم؟ من اقترب من مكافأة الولاء؟ من يتغيّب؟ من انقطع؟
const SEGMENTS = ["all", "vip", "gifts", "near", "noshow", "inactive", "blocked"] as const;
type Segment = (typeof SEGMENTS)[number];

const SEG_LABEL: Record<Segment, { ar: string; en: string }> = {
  all: { ar: "الكل", en: "All" },
  vip: { ar: "VIP", en: "VIP" },
  gifts: { ar: "لهم هدايا", en: "Have gifts" },
  near: { ar: "قريبون من مكافأة", en: "Near reward" },
  noshow: { ar: "متغيّبون", en: "No-shows" },
  inactive: { ar: "منقطعون +30 يوم", en: "Inactive 30d+" },
  blocked: { ar: "محظورون", en: "Blocked" },
};

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; seg?: string }>;
}) {
  const lang = await getLang();
  const load = await loadOwner();
  if (load.state !== "ok") return null;
  const { supabase, restaurant, modules, role, permissions } = load.ctx;

  if (!isModuleOn(modules, "crm") || !staffHasPermission(role, permissions, "customers")) {
    redirect("/dashboard");
  }

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const seg: Segment = (SEGMENTS as readonly string[]).includes(sp.seg ?? "") ? (sp.seg as Segment) : "all";

  // البحث يُنفَّذ في القاعدة (لا في الذاكرة): اسم أو رقم — الرقم يُطبَّع أولًا
  let query = supabase
    .from("customer_restaurant")
    .select("*, customers!inner(full_name, phone)")
    .eq("restaurant_id", restaurant.id);
  if (q) {
    const digits = normalizePhone(q);
    const parts = [`full_name.ilike.%${q.replace(/[%,()]/g, "")}%`];
    if (digits.length >= 3) parts.push(`phone.like.%${digits}%`);
    query = query.or(parts.join(","), { referencedTable: "customers" });
  }
  const { data } = await query
    .order("is_vip", { ascending: false })
    .order("visits", { ascending: false })
    .limit(500);
  let list = (data ?? []) as Profile[];

  // من لديهم هدايا فعّالة + عتبة الولاء (لشريحتي «لهم هدايا» و«قريبون من مكافأة»)
  const [{ data: activeRewards }, { data: loyalty }] = await Promise.all([
    supabase.from("customer_rewards").select("customer_id").eq("restaurant_id", restaurant.id).eq("status", "active"),
    supabase.from("loyalty_programs").select("reward_threshold").eq("restaurant_id", restaurant.id).eq("is_active", true).maybeSingle(),
  ]);
  const giftedIds = new Set((activeRewards ?? []).map((r) => r.customer_id));
  const threshold = loyalty?.reward_threshold ?? 0;
  const cutoff30 = Date.now() - 30 * 864e5;

  const matches = (p: Profile, s: Segment): boolean => {
    switch (s) {
      case "vip": return p.is_vip;
      case "gifts": return giftedIds.has(p.customer_id);
      case "near": return threshold > 0 && !p.is_blocked && p.points >= Math.ceil(threshold * 0.7) && p.points < threshold;
      case "noshow": return p.no_shows >= 2;
      case "inactive": return !!p.last_visit && new Date(p.last_visit).getTime() < cutoff30;
      case "blocked": return p.is_blocked;
      default: return true;
    }
  };

  // عدّادات الشرائح تُحسب على نتائج البحث الحالي (فتبقى متسقة مع ما يراه المستخدم)
  const segCounts = Object.fromEntries(SEGMENTS.map((s) => [s, list.filter((p) => matches(p, s)).length])) as Record<Segment, number>;
  if (seg !== "all") list = list.filter((p) => matches(p, seg));

  const vips = segCounts.vip;
  const totalVisits = list.reduce((a, p) => a + p.visits, 0);
  const avgVisits = list.length ? Math.round((totalVisits / list.length) * 10) / 10 : 0;
  // عدّادات الحملة الفعلية من القاعدة — الحملة تُرسَل للشريحة كاملة في
  // الخادم، وكان العدّ من شريحة الـ٥٠٠ المعروضة فقط: مالكٌ عنده ٣٠٠٠ عميل
  // يقرأ «ستصل ٥٠٠» ثم تصل ٣٠٠٠ هدية ممولة. count رأسي رخيص بلا صفوف.
  const [allCount, vipCount, goldCount, silverCount, returningCount] = await Promise.all([
    supabase.from("customer_restaurant").select("customer_id", { count: "exact", head: true }).eq("restaurant_id", restaurant.id),
    supabase.from("customer_restaurant").select("customer_id", { count: "exact", head: true }).eq("restaurant_id", restaurant.id).eq("is_vip", true),
    supabase.from("customer_restaurant").select("customer_id", { count: "exact", head: true }).eq("restaurant_id", restaurant.id).eq("tier", "gold"),
    supabase.from("customer_restaurant").select("customer_id", { count: "exact", head: true }).eq("restaurant_id", restaurant.id).eq("tier", "silver"),
    supabase.from("customer_restaurant").select("customer_id", { count: "exact", head: true }).eq("restaurant_id", restaurant.id).gte("visits", 2),
  ]);
  const campaignCounts = {
    all: allCount.count ?? segCounts.all,
    vip: vipCount.count ?? vips,
    gold: goldCount.count ?? 0,
    silver: silverCount.count ?? 0,
    returning: returningCount.count ?? 0,
  };

  const hrefFor = (s: Segment) => `/dashboard/customers?seg=${s}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <div className="space-y-6">
        <div className="grid grid-cols-3 gap-3">
          <Kpi label={tr(lang, "عملاؤك", "Your customers")} value={toAr(segCounts.all)} tone="var(--brand-d)" />
          <Kpi label={tr(lang, "مميّزون (VIP)", "VIPs")} value={toAr(vips)} tone="var(--st-open)" />
          <Kpi label={tr(lang, "متوسط الزيارات", "Avg. visits")} value={toAr(avgVisits)} tone="var(--st-full)" />
        </div>

        {/* بحث بالاسم أو الرقم — يُنفَّذ في القاعدة */}
        <form method="get" className="flex gap-2">
          {seg !== "all" && <input type="hidden" name="seg" value={seg} />}
          <input
            name="q"
            defaultValue={q}
            placeholder={tr(lang, "ابحث بالاسم أو رقم الجوّال…", "Search by name or phone…")}
            className="field-input flex-1"
          />
          <button className="btn btn-primary shrink-0 px-5">{tr(lang, "بحث", "Search")}</button>
          {q && (
            <Link href={hrefFor(seg)} className="btn btn-secondary shrink-0 px-4">{tr(lang, "مسح", "Clear")}</Link>
          )}
        </form>

        {/* شرائح جاهزة بعدّاداتها */}
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {SEGMENTS.map((s) => {
            const active = s === seg;
            return (
              <Link
                key={s}
                href={hrefFor(s)}
                className="shrink-0 rounded-2xl px-3.5 py-2 text-sm font-extrabold transition active:scale-[0.97]"
                style={active
                  ? { background: "var(--brand-solid)", color: "var(--brand-ink)", boxShadow: "0 10px 20px -14px rgba(102,28,10,0.7)" }
                  : { background: "var(--surface-2)", color: "var(--ink)", border: "1px solid rgba(102,28,10,0.12)" }}
              >
                {tr(lang, SEG_LABEL[s].ar, SEG_LABEL[s].en)}
                <span className="ms-1.5 rounded-full px-1.5 text-xs" style={{ background: active ? "rgba(255,255,255,0.2)" : "rgba(102,28,10,0.08)" }}>
                  {toAr(segCounts[s])}
                </span>
              </Link>
            );
          })}
        </div>

        <CampaignForm counts={campaignCounts} />

        {list.length === 0 ? (
          <div className="soft-card py-10 text-center">
            <p className="text-2xl">👥</p>
            <p className="mt-2 font-bold text-[color:var(--ink)]">
              {q || seg !== "all" ? tr(lang, "لا نتائج مطابقة", "No matching results") : tr(lang, "لا يوجد عملاء بعد", "No customers yet")}
            </p>
            <p className="mt-1 text-sm text-[color:var(--muted)]">
              {q || seg !== "all"
                ? tr(lang, "جرّب بحثًا آخر أو شريحة أخرى.", "Try another search or segment.")
                : tr(lang, "تظهر الملفّات تلقائيًا عند إجلاس العملاء من الطابور.", "Profiles appear automatically when customers are seated from the queue.")}
            </p>
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
                        {/* الاسم يبدو رابطًا بوضوح: الصفّ كله قابل للضغط لكن أحدًا لم يكن يعرف */}
                        <p className="truncate font-bold text-brand-700 underline decoration-brand-700/40 decoration-2 underline-offset-4">{name}</p>
                        <span aria-hidden className="shrink-0 text-[11px] text-brand-700 opacity-70">↗</span>
                        {p.is_vip && <span className="rounded-full px-2 py-0.5 text-[10px] font-extrabold" style={{ background: "rgba(120,30,12,0.10)", color: "var(--brand-solid)" }}>VIP</span>}
                        {giftedIds.has(p.customer_id) && <span className="rounded-full px-2 py-0.5 text-[10px] font-extrabold" style={{ background: "var(--brand-solid)", color: "var(--brand-ink)" }}>🎁 {tr(lang, "هدية فعّالة", "Active gift")}</span>}
                        {p.is_blocked && <span className="rounded-full px-2 py-0.5 text-[10px] font-extrabold text-cream-100" style={{ background: "var(--st-closed)" }}>{tr(lang, "محظور", "Blocked")}</span>}
                      </div>
                      <p className="text-sm text-[color:var(--muted)]" dir="ltr">{c?.phone ?? "—"}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[color:var(--muted)]">
                        <span className="rounded-full px-2 py-0.5 font-bold" style={{ background: tm.bg, color: tm.color }}>{tr(lang, tm.label, TIER_LABEL_EN[p.tier] ?? tm.label)}</span>
                        <span>{tr(lang, `${toAr(p.visits)} زيارة`, `${toAr(p.visits)} visits`)}</span>
                        <span>· {tr(lang, `آخر زيارة ${daysAgoLabel(p.last_visit, "ar")}`, `Last visit ${daysAgoLabel(p.last_visit, "en")}`)}</span>
                        {threshold > 0 && p.points > 0 && (
                          <span style={{ color: "var(--brand-d)" }}>· {tr(lang, `${toAr(p.points)}/${toAr(threshold)} نقطة`, `${toAr(p.points)}/${toAr(threshold)} pts`)}</span>
                        )}
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
