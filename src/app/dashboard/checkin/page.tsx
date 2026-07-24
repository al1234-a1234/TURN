import { redirect } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { loadOwner } from "../owner-context";
import { isModuleOn, staffHasPermission } from "@/lib/features";
import { saveCheckinSettings } from "./actions";
import { CheckinPoster } from "./checkin-poster";
import { toAr } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export default async function CheckinPage() {
  const lang = await getLang();
  const load = await loadOwner();
  if (load.state !== "ok") return null;
  const { supabase, restaurant, modules, role, permissions } = load.ctx;

  if (!isModuleOn(modules, "checkin") || !staffHasPermission(role, permissions, "loyalty")) {
    redirect("/dashboard");
  }

  // رابط المسح + باركود
  const h = await headers();
  const host = h.get("host") ?? "turn-alpha.vercel.app";
  const proto = host.includes("localhost") ? "http" : "https";
  const link = `${proto}://${host}/g/${restaurant.slug}`;
  const svg = await QRCode.toString(link, {
    type: "svg",
    margin: 1,
    color: { dark: "#661c0a", light: "#00000000" },
  });

  const todayIso = new Date(new Date().toDateString()).toISOString();
  const [{ data: settings }, totalRes, todayRes, custRes] = await Promise.all([
    supabase.from("checkin_settings").select("*").eq("restaurant_id", restaurant.id).maybeSingle(),
    supabase.from("checkins").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurant.id),
    supabase.from("checkins").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurant.id).gte("created_at", todayIso),
    supabase.from("customer_restaurant").select("customer_id", { count: "exact", head: true }).eq("restaurant_id", restaurant.id),
  ]);

  const enabled = settings?.welcome_enabled ?? true;
  const kind = settings?.welcome_kind ?? "discount";
  const title = settings?.welcome_title ?? "خصم ترحيب";
  const valueKind = settings?.welcome_value_kind ?? "percent";
  const value = settings?.welcome_value ?? null;
  const days = settings?.welcome_expires_days ?? 14;

  const field = "field-input";

  return (
    <div className="space-y-6">
      {/* شرح مختصر */}
      <div className="soft-card p-5">
        <h1 className="font-display text-lg font-bold text-[color:var(--ink)]">{tr(lang, "امسح خذ هديتك", "Scan & get your gift")}</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          {tr(lang,
            "علّق الباركود على الطاولة أو الكاشير. العميل يمسح، يكتب رقمه، ويستلم هديته — بدون طابور وبدون تطبيق. وأنت تبني قاعدة عملائك مع كل مسح.",
            "Put the QR on the table or counter. Customers scan, enter their number, and get their gift — no queue, no app. You build your customer base with every scan.")}
        </p>
      </div>

      {/* إحصاءات */}
      <div className="grid grid-cols-3 gap-3">
        <Kpi label={tr(lang, "إجمالي المسحات", "Total scans")} value={toAr(totalRes.count ?? 0)} tone="var(--brand-d)" />
        <Kpi label={tr(lang, "اليوم", "Today")} value={toAr(todayRes.count ?? 0)} tone="var(--st-full)" />
        <Kpi label={tr(lang, "عملاؤك", "Your customers")} value={toAr(custRes.count ?? 0)} tone="var(--brand-d)" />
      </div>

      {/* الباركود + الملصق */}
      <section className="soft-card p-5">
        <h2 className="mb-4 font-display text-lg font-bold text-[color:var(--ink)]">{tr(lang, "باركود مطعمك", "Your restaurant QR")}</h2>
        <CheckinPoster
          svg={svg}
          name={restaurant.name}
          link={link}
          labels={{
            scan: tr(lang, "امسح خذ هديتك 🎁", "Scan & get your gift 🎁"),
            sub: tr(lang, "رقمك يكفي — بدون تطبيق", "Your number is enough — no app"),
            print: tr(lang, "اطبع الملصق", "Print poster"),
            copy: tr(lang, "انسخ الرابط", "Copy link"),
            copied: tr(lang, "تم النسخ ✓", "Copied ✓"),
            poweredBy: tr(lang, "مقدّم من دور", "Powered by Turn"),
          }}
        />
      </section>

      {/* إعداد هدية الترحيب */}
      <section className="soft-card p-5">
        <h2 className="mb-1 font-display text-lg font-bold text-[color:var(--ink)]">{tr(lang, "هدية الترحيب", "Welcome gift")}</h2>
        <p className="mb-4 text-sm text-[color:var(--muted)]">{tr(lang, "تُمنح تلقائيًا لأول مسح لكل عميل — سبب يخليه يمسح.", "Auto-granted on each customer's first scan — the reason they scan.")}</p>
        <form action={saveCheckinSettings} className="space-y-4">
          <label className="flex items-center justify-between rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
            <span>
              <span className="block font-bold text-[color:var(--ink)]">{tr(lang, "تفعيل هدية الترحيب", "Enable welcome gift")}</span>
              <span className="text-xs text-[color:var(--muted)]">{tr(lang, "عند الإطفاء يظل المسح يسجّل الزيارة بدون هدية", "When off, scanning still records the visit without a gift")}</span>
            </span>
            <input type="checkbox" name="welcome_enabled" defaultChecked={enabled} className="h-6 w-6 accent-[#a3341a]" />
          </label>

          <div>
            <label className="field-label">{tr(lang, "عنوان الهدية", "Gift title")}</label>
            <input name="welcome_title" defaultValue={title} placeholder={tr(lang, "مثال: خصم ترحيب ٢٠٪", "e.g. 20% welcome discount")} className={field} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="field-label">{tr(lang, "النوع", "Type")}</label>
              <select name="welcome_kind" defaultValue={kind} className={field}>
                <option value="discount">{tr(lang, "خصم", "Discount")}</option>
                <option value="gift">{tr(lang, "هديّة", "Gift")}</option>
              </select>
            </div>
            <div>
              <label className="field-label">{tr(lang, "القيمة", "Value")}</label>
              <input name="welcome_value" inputMode="numeric" defaultValue={value != null ? toAr(value) : ""} placeholder={tr(lang, "٢٠", "20")} className={field} />
            </div>
            <div>
              <label className="field-label">{tr(lang, "الوحدة", "Unit")}</label>
              <select name="welcome_value_kind" defaultValue={valueKind} className={field}>
                <option value="percent">{tr(lang, "٪ نسبة", "% percent")}</option>
                <option value="amount">{tr(lang, "ر.س مبلغ", "SAR amount")}</option>
              </select>
            </div>
          </div>

          <div>
            <label className="field-label">{tr(lang, "صلاحية الهدية (أيام)", "Gift validity (days)")}</label>
            <input name="welcome_expires_days" inputMode="numeric" defaultValue={toAr(days)} className={field} />
          </div>

          <button className="btn btn-primary w-full">{tr(lang, "حفظ", "Save")}</button>
        </form>
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
