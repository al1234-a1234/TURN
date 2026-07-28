import { redirect } from "next/navigation";
import { loadOwner } from "../owner-context";
import { isModuleOn, staffHasPermission } from "@/lib/features";
import { saveLoyaltyProgram } from "./actions";
import { toAr } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import type { Database } from "@/lib/supabase/database.types";

type Member = Database["public"]["Tables"]["customer_restaurant"]["Row"] & {
  customers: { full_name: string; phone: string } | { full_name: string; phone: string }[] | null;
};

export default async function LoyaltyPage() {
  const lang = await getLang();
  const load = await loadOwner();
  if (load.state !== "ok") return null;
  const { supabase, restaurant, modules, role, permissions } = load.ctx;

  if (!isModuleOn(modules, "loyalty") || !staffHasPermission(role, permissions, "loyalty")) {
    redirect("/dashboard");
  }

  const { data: program } = await supabase
    .from("loyalty_programs").select("*").eq("restaurant_id", restaurant.id).maybeSingle();
  const progThreshold = program?.reward_threshold ?? 10;
  const progPerVisit = Math.max(1, program?.points_per_visit ?? 1);

  const [{ data: members }, { data: nearRows }, { data: winbackRows }] = await Promise.all([
    supabase
      .from("customer_restaurant")
      .select("customer_id, points, visits, tier, customers!inner(full_name, phone)")
      .eq("restaurant_id", restaurant.id)
      .gt("points", 0)
      .order("points", { ascending: false })
      .limit(20),
    // «باقي زيارة واحدة» ثم انقطع أسبوعًا: أثمن دفعة في البرنامج كله —
    // من زار أمس رأى الاحتفاء على شاشته، أما هذا فيحتاج من يذكّره
    supabase
      .from("customer_restaurant")
      .select("customer_id, points, visits, last_visit, customers!inner(full_name, phone)")
      .eq("restaurant_id", restaurant.id)
      .gte("points", progThreshold - progPerVisit)
      .lt("points", progThreshold)
      .lt("last_visit", new Date(Date.now() - 7 * 864e5).toISOString())
      .order("last_visit", { ascending: true })
      .limit(30),
    // هدايا العودة المولّدة تلقائيًّا وما زالت فعّالة — كانت تُمنح ولا يعلم بها أحد:
    // العميل المنقطع لن يفتح التطبيق ليكتشفها، فنعطي المالك زرّ إرسالها واتساب.
    supabase
      .from("customer_rewards")
      .select("id, title, code, value, value_kind, expires_at, created_at, customers!inner(full_name, phone)")
      .eq("restaurant_id", restaurant.id)
      .eq("description", "هدية استرجاع تلقائية")
      .eq("status", "active")
      .gte("created_at", new Date(Date.now() - 14 * 864e5).toISOString())
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  type WinbackRow = {
    id: string; title: string; code: string | null; value: number | null;
    value_kind: string | null; expires_at: string | null; created_at: string;
    customers: { full_name: string | null; phone: string | null } | { full_name: string | null; phone: string | null }[] | null;
  };
  const winback = ((winbackRows ?? []) as WinbackRow[]).map((w) => {
    const c = Array.isArray(w.customers) ? w.customers[0] : w.customers;
    return { ...w, name: c?.full_name ?? null, phone: c?.phone ?? null };
  }).filter((w) => w.phone);

  const waLink = (w: { phone: string | null; title: string; code: string | null }) => {
    const digits = (w.phone ?? "").replace(/\D/g, "").replace(/^0/, "966");
    const msg = `مرحبًا 👋 اشتقنا لك في ${restaurant.name}!\n` +
      `عندك هدية بانتظارك: ${w.title}${w.code ? ` — رمزها ${w.code}` : ""}.\n` +
      `اعرض الرمز عند الكاشير وتسعد فيها 🌿`;
    return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
  };

  const active = program?.is_active ?? false;
  const perVisit = progPerVisit;
  const threshold = progThreshold;
  const list = (members ?? []) as Member[];
  const readyToRedeem = list.filter((m) => m.points >= threshold).length;

  type NearRow = {
    customer_id: string; points: number; visits: number; last_visit: string | null;
    customers: { full_name: string | null; phone: string | null } | { full_name: string | null; phone: string | null }[] | null;
  };
  const near = ((nearRows ?? []) as NearRow[]).map((n) => {
    const c = Array.isArray(n.customers) ? n.customers[0] : n.customers;
    return { ...n, name: c?.full_name ?? null, phone: c?.phone ?? null };
  }).filter((n) => n.phone);

  const nearWaLink = (n: { phone: string | null; name: string | null }) => {
    const digits = (n.phone ?? "").replace(/\D/g, "").replace(/^0/, "966");
    const msg = `${n.name ? `مرحبًا ${n.name.split(/\s+/)[0]} 👋` : "مرحبًا 👋"}\n` +
      `باقي لك زيارة واحدة فقط في ${restaurant.name} وتاخذ ${program?.reward_description || "مكافأتك"} 🎁\n` +
      `نشوفك قريب!`;
    return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
  };

  const field = "field-input";

  return (
    <div className="space-y-6">
        <div className="grid grid-cols-3 gap-3">
          <Kpi label={tr(lang, "الحالة", "Status")} value={active ? tr(lang, "نشط", "Active") : tr(lang, "متوقّف", "Paused")} tone={active ? "var(--st-open)" : "var(--muted)"} />
          <Kpi label={tr(lang, "أعضاء بنقاط", "Members with points")} value={toAr(list.length)} tone="var(--brand-d)" />
          <Kpi label={tr(lang, "جاهزون للمكافأة", "Ready for reward")} value={toAr(readyToRedeem)} tone="var(--st-full)" />
        </div>

        {/* على بُعد زيارة واحدة ثم انقطعوا — أثمن تذكير في البرنامج كله */}
        {active && near.length > 0 && (
          <section className="soft-card p-5">
            <h2 className="mb-1 font-display text-lg font-bold text-[color:var(--ink)]">
              🔥 {tr(lang, `على بُعد زيارة واحدة (${toAr(near.length)})`, `One visit away (${near.length})`)}
            </h2>
            <p className="mb-4 text-sm text-[color:var(--muted)]">
              {tr(lang,
                "وصلوا لآخر ختم ثم انقطعوا أسبوعًا أو أكثر. رسالة واحدة تعيدهم — المكافأة التي كادوا يأخذونها أقوى حافز يملكه مطعمك.",
                "They reached the last stamp then went quiet for a week+. One message brings them back — the reward they almost earned is the strongest incentive you have.")}
            </p>
            <ul className="space-y-2">
              {near.map((n) => (
                <li key={n.customer_id} className="flex items-center gap-3 rounded-2xl border p-3"
                    style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-extrabold text-[color:var(--ink)]">{n.name ?? tr(lang, "عميل", "Customer")}</p>
                    <p className="text-[11px] font-bold text-[color:var(--muted)]">
                      {tr(lang, `${toAr(n.points)}/${toAr(threshold)} نقطة · ${toAr(n.visits)} زيارة`,
                               `${toAr(n.points)}/${toAr(threshold)} pts · ${toAr(n.visits)} visits`)}
                    </p>
                  </div>
                  <a href={nearWaLink(n)} target="_blank" rel="noreferrer"
                     className="shrink-0 rounded-xl px-4 py-2 text-xs font-extrabold text-white"
                     style={{ background: "linear-gradient(150deg,#1fa855,#0d7a3c)" }}>
                    {tr(lang, "ذكّره واتساب", "Nudge on WhatsApp")}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* هدايا العودة الجاهزة للإرسال — بلا هذا الزر كانت تُمنح في صمت تامّ */}
        {winback.length > 0 && (
          <section className="soft-card p-5">
            <h2 className="mb-1 font-display text-lg font-bold text-[color:var(--ink)]">
              💌 {tr(lang, `هدايا عودة بانتظار الإرسال (${toAr(winback.length)})`, `Win-back gifts awaiting send (${winback.length})`)}
            </h2>
            <p className="mb-4 text-sm text-[color:var(--muted)]">
              {tr(lang,
                "مُنحت تلقائيًّا لعملاء انقطعوا ٣٠ يومًا. أرسلها واتساب بضغطة — العميل المنقطع لن يكتشفها وحده.",
                "Granted automatically to customers away 30+ days. Send via WhatsApp — a lapsed customer won't discover it on their own.")}
            </p>
            <ul className="space-y-2">
              {winback.map((w) => (
                <li key={w.id} className="flex items-center gap-3 rounded-2xl border p-3"
                    style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-extrabold text-[color:var(--ink)]">{w.name ?? tr(lang, "عميل", "Customer")}</p>
                    <p className="text-[11px] font-bold text-[color:var(--muted)]">
                      {w.title}{w.code ? <span dir="ltr"> · {w.code}</span> : null}
                    </p>
                  </div>
                  <a href={waLink(w)} target="_blank" rel="noreferrer"
                     className="shrink-0 rounded-xl px-4 py-2 text-xs font-extrabold text-white"
                     style={{ background: "linear-gradient(150deg,#1fa855,#0d7a3c)" }}>
                    {tr(lang, "أرسل واتساب", "Send WhatsApp")}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* إعداد البرنامج */}
        <section className="soft-card p-5">
          <h2 className="mb-1 font-display text-lg font-bold text-[color:var(--ink)]">{tr(lang, "برنامج الولاء", "Loyalty program")}</h2>
          <p className="mb-4 text-sm text-[color:var(--muted)]">{tr(lang, "نقاط لكل زيارة ومكافأة تُبقي العميل يرجع لك.", "Points per visit and a reward that keeps customers coming back.")}</p>
          <form action={saveLoyaltyProgram} className="space-y-4">
            <label className="flex items-center justify-between rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
              <span>
                <span className="block font-bold text-[color:var(--ink)]">{tr(lang, "تفعيل البرنامج", "Activate program")}</span>
                <span className="text-xs text-[color:var(--muted)]">{tr(lang, "عند التفعيل تُحتسب النقاط تلقائيًا لكل عميل يُجلَس", "When active, points are counted automatically for every seated customer")}</span>
              </span>
              <input type="checkbox" name="is_active" defaultChecked={active} className="h-6 w-6 accent-[#a3341a]" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label">{tr(lang, "نقاط لكل زيارة", "Points per visit")}</label>
                <input name="points_per_visit" inputMode="numeric" defaultValue={toAr(perVisit)} className={field} />
              </div>
              <div>
                <label className="field-label">{tr(lang, "نقاط المكافأة", "Reward points")}</label>
                <input name="reward_threshold" inputMode="numeric" defaultValue={toAr(threshold)} className={field} />
              </div>
            </div>
            <div>
              <label className="field-label">{tr(lang, "وصف المكافأة", "Reward description")}</label>
              <input name="reward_description" defaultValue={program?.reward_description ?? ""} placeholder={tr(lang, "مثال: وجبة مجانية عند 10 نقاط", "e.g. Free meal at 10 points")} className={field} />
            </div>
            {/* استرجاع المنقطعين — يعمل تلقائيًّا كل يوم عبر كرون القاعدة */}
            <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
              <label className="flex items-center justify-between">
                <span>
                  <span className="block font-bold text-[color:var(--ink)]">{tr(lang, "استرجاع المنقطعين تلقائيًا 🪃", "Auto win-back 🪃")}</span>
                  <span className="text-xs text-[color:var(--muted)]">{tr(lang, "من انقطع +30 يومًا تصله هدية عودة تلقائيًا (مرة كل 60 يومًا كحد أقصى)", "Guests inactive 30+ days get a comeback gift automatically (at most once per 60 days)")}</span>
                </span>
                <input type="checkbox" name="winback_enabled" defaultChecked={program?.winback_enabled ?? false} className="h-6 w-6 accent-[#a3341a]" />
              </label>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <input name="winback_title" defaultValue={program?.winback_title ?? "اشتقنا لك — هدية عودة 🎁"} placeholder={tr(lang, "عنوان الهدية", "Gift title")} className={field} />
                <input name="winback_value" inputMode="numeric" defaultValue={program?.winback_value ?? ""} placeholder={tr(lang, "نسبة الخصم ٪ (اختياري)", "Discount % (optional)")} className={field} />
              </div>
            </div>

            <button className="btn btn-primary w-full">{tr(lang, "حفظ البرنامج", "Save program")}</button>
          </form>
        </section>

        {/* الأعضاء */}
        <section>
          <h2 className="mb-3 font-display text-lg font-bold text-[color:var(--ink)]">{tr(lang, "أعلى الأعضاء", "Top members")}</h2>
          {list.length === 0 ? (
            <div className="soft-card py-10 text-center">
              <p className="text-2xl">⭐</p>
              <p className="mt-2 font-bold text-[color:var(--ink)]">{tr(lang, "لا توجد نقاط بعد", "No points yet")}</p>
              <p className="mt-1 text-sm text-[color:var(--muted)]">{tr(lang, "فعّل البرنامج لتبدأ النقاط بالتراكم مع كل زيارة.", "Activate the program to start accumulating points with every visit.")}</p>
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
                      <p className="truncate font-bold text-[color:var(--ink)]">{c?.full_name ?? tr(lang, "عميل", "Customer")}</p>
                      <p className="text-xs text-[color:var(--muted)]">{tr(lang, `${toAr(m.visits)} زيارة`, `${toAr(m.visits)} visits`)}</p>
                    </div>
                    <div className="text-left">
                      <p className="font-display text-xl font-bold text-brand-700">{toAr(m.points)}</p>
                      <p className="text-[10px] font-bold" style={{ color: ready ? "var(--st-open)" : "var(--muted)" }}>{ready ? tr(lang, "جاهز للمكافأة", "Ready for reward") : tr(lang, "نقطة", "Points")}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
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
