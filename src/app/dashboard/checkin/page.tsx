import { redirect } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { loadOwner } from "../owner-context";
import { riyadhDayStart } from "@/lib/dates";
import { resolveBranchScope, NO_BRANCH } from "../branch-scope";
import { BranchPicker } from "../branch-picker";
import { isModuleOn, staffHasPermission } from "@/lib/features";
import { CheckinPoster } from "./checkin-poster";
import { ScanRulesForm } from "./scan-rules";
import { toAr } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export default async function CheckinPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
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
  // الإعدادات والملصق صارا لكل فرع؛ الرابط يحمل الفرع (والملصقات القديمة بلا فرع تبقى تعمل)
  const scope = await resolveBranchScope(load.ctx, (await searchParams).branch);
  const activeBranchId = scope.active?.id ?? NO_BRANCH;
  const link = `${proto}://${host}/g/${restaurant.slug}?b=${activeBranchId}`;
  const svg = await QRCode.toString(link, {
    type: "svg",
    margin: 1,
    color: { dark: "#661c0a", light: "#00000000" },
  });

  const todayIso = riyadhDayStart().toISOString();
  const [{ data: settings }, totalRes, todayRes, custRes] = await Promise.all([
    supabase.from("checkin_settings").select("*").eq("branch_id", activeBranchId).maybeSingle(),
    supabase.from("checkins").select("id", { count: "exact", head: true }).eq("branch_id", activeBranchId),
    supabase.from("checkins").select("id", { count: "exact", head: true }).eq("branch_id", activeBranchId).gte("created_at", todayIso),
    supabase.from("customer_restaurant").select("customer_id, customers!inner(id)", { count: "exact", head: true }).eq("restaurant_id", restaurant.id),
  ]);

  // القيم من القاعدة مباشرة — الترحيل 0045 يضمن صفًّا لكل فرع، فلا نعرض
  // «مفعّلة» افتراضيًّا بينما القاعدة لا تمنح شيئًا (كذبة الواجهة السابقة)
  const s = settings as (typeof settings & {
    instant_enabled?: boolean; instant_kind?: string; instant_title?: string;
    instant_value?: number | null; instant_value_kind?: string; instant_expires_days?: number;
    preset_key?: string | null;
  }) | null;
  const rules = {
    welcome_enabled: s?.welcome_enabled ?? false,
    welcome_kind: s?.welcome_kind ?? "discount",
    welcome_title: s?.welcome_title ?? "خصم ترحيب ٢٠٪",
    welcome_value: s?.welcome_value ?? null,
    welcome_value_kind: s?.welcome_value_kind ?? "percent",
    welcome_expires_days: s?.welcome_expires_days ?? 14,
    instant_enabled: s?.instant_enabled ?? false,
    instant_kind: s?.instant_kind ?? "discount",
    instant_title: s?.instant_title ?? "خصم اليوم",
    instant_value: s?.instant_value ?? null,
    instant_value_kind: s?.instant_value_kind ?? "percent",
    instant_expires_days: s?.instant_expires_days ?? 1,
    preset_key: s?.preset_key ?? null,
  };

  return (
    <div className="space-y-6">
      {scope.multi && scope.active && (
        <BranchPicker branches={scope.branches} activeId={scope.active.id} label="ملصق الفرع" />
      )}
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

      {/* ماذا يفعل الباركود؟ — التحكّم الكامل + مكتبة القوالب */}
      <section className="soft-card p-5">
        <h2 className="mb-1 font-display text-lg font-bold text-[color:var(--ink)]">{tr(lang, "ماذا يفعل الباركود؟", "What does the barcode do?")}</h2>
        <p className="mb-4 text-sm text-[color:var(--muted)]">
          {tr(lang,
            "أنت تقرّر: هدية لأول مسح، مكافأة مع كل مسح، الاثنان معًا، أو تسجيل صامت. والمسح دائمًا يسجّل الزيارة ويبني قاعدة عملائك.",
            "You decide: a first-scan gift, a reward on every scan, both, or silent check-in. Scanning always records the visit and builds your customer base.")}
        </p>
        <ScanRulesForm initial={rules} branchId={activeBranchId} lang={lang} />
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
