import { redirect } from "next/navigation";
import Link from "next/link";
import { loadOwner } from "../owner-context";
import { isModuleOn, staffHasPermission } from "@/lib/features";
import { CustomerControls } from "./customer-controls";
import { CampaignForm } from "./campaign-form";
import { SegmentsManager, type CustomSegment } from "./segments-manager";
import { WinbackForm } from "./winback-form";
import { toAr, normalizePhone } from "@/lib/format";
import { daysAgoLabel } from "@/lib/dates";
import { tr } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { ScreenGuide } from "@/components/screen-guide";
import type { Database } from "@/lib/supabase/database.types";

type Profile = Database["public"]["Functions"]["customers_page_rows"]["Returns"][number];


// الشرائح المتاحة للفلترة — تجيب على أسئلة المالك الفعلية:
// من المميّز؟ من عنده هدية لم تُستخدم؟ من يتغيّب؟ من انقطع؟
const SEGMENTS = ["all", "vip", "gifts", "noshow", "inactive", "blocked"] as const;
type Segment = (typeof SEGMENTS)[number];

const SEG_LABEL: Record<Segment, { ar: string; en: string }> = {
  all: { ar: "الكل", en: "All" },
  vip: { ar: "VIP", en: "VIP" },
  gifts: { ar: "لهم هدايا", en: "Have gifts" },
  noshow: { ar: "متغيّبون", en: "No-shows" },
  inactive: { ar: "منقطعون +30 يوم", en: "Inactive 30d+" },
  blocked: { ar: "محظورون", en: "Blocked" },
};

const PAGE_SIZE = 500;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; seg?: string; page?: string }>;
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
  // صفحاتٌ حقيقية بدل قصّة الـ٥٠٠: مطعمٌ عدد عملائه يفوقها كان لا يملك طريقةً
  // للوصول لمن بعدها بالتصفّح (البحث وحده كان ينفذ إلى القاعدة كاملةً).
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  // البحث يُنفَّذ في القاعدة (لا في الذاكرة): اسم أو رقم — الرقم يُطبَّع أولًا.
  // مبنيٌّ كنصٍّ لا كسلسلة استدعاءات لأننا نحتاجه مرّتين: عدًّا دقيقًا
  // للصفحات، وجلبًا لصفّ الصفحة الحالية — والقاعدة لا تُرجع الاثنين معًا.
  const digits = normalizePhone(q);
  const searchOr = q
    ? [`full_name.ilike.%${q.replace(/[%,()]/g, "")}%`, ...(digits.length >= 3 ? [`phone.like.%${digits}%`] : [])].join(",")
    : null;

  // عدّ الصفحات وجلب صفوفها عبر RPC (0209, 0213) لا استعلامٍ مباشر على
  // customer_restaurant: ذاك كان يمرّ بـRLS مضاعَفًا (الجدول نفسه + جدول
  // customers المرتبط)، وقِسته فعليًّا بهويّة staff حقيقية — ١٥.٢ ثانية
  // لصفحةٍ واحدة من ٥٠٠ صفّ لمطعمٍ بحجم Eficto. هذا يتجاوز أي مهلة معقولة
  // فتفشل الصفحة أحيانًا (توقيتٌ حظّي) وتُقرأ الفشلة الصامتة «صفر عملاء».
  const [{ data: matchCount }, { data, error: rowsError }] = await Promise.all([
    supabase.rpc("customers_search_count", {
      p_restaurant_id: restaurant.id,
      p_query: q || undefined,
      p_digits: digits.length >= 3 ? digits : undefined,
    }),
    supabase.rpc("customers_page_rows", {
      p_restaurant_id: restaurant.id,
      p_query: q || undefined,
      p_digits: digits.length >= 3 ? digits : undefined,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    }),
  ]);
  if (rowsError) console.error("[CustomersPage] customers_page_rows", rowsError.message);
  let list = (data ?? []) as Profile[];
  const totalMatches = matchCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalMatches / PAGE_SIZE));

  // من لديهم هدايا فعّالة (لشريحة «لهم هدايا»)
  const { data: activeRewards } = await supabase
    .from("customer_rewards").select("customer_id")
    .eq("restaurant_id", restaurant.id).eq("status", "active");
  const giftedIds = new Set((activeRewards ?? []).map((r) => r.customer_id));

  const { data: winback } = await supabase
    .from("winback_settings")
    .select("is_active, title, value, value_kind, days_inactive")
    .eq("restaurant_id", restaurant.id)
    .maybeSingle();
  const cutoff30 = Date.now() - 30 * 864e5;

  const matches = (p: Profile, s: Segment): boolean => {
    switch (s) {
      case "vip": return p.is_vip;
      case "gifts": return giftedIds.has(p.customer_id);
      case "noshow": return p.no_shows >= 2;
      case "inactive": return !!p.last_visit && new Date(p.last_visit).getTime() < cutoff30;
      case "blocked": return p.is_blocked;
      default: return true;
    }
  };

  // عدّادات الشرائح تُحسب على نتائج البحث الحالي (فتبقى متسقة مع ما يراه المستخدم)
  const segCounts = Object.fromEntries(SEGMENTS.map((s) => [s, list.filter((p) => matches(p, s)).length])) as Record<Segment, number>;
  if (seg !== "all") list = list.filter((p) => matches(p, seg));

  const totalVisits = list.reduce((a, p) => a + p.visits, 0);
  const avgVisits = list.length ? Math.round((totalVisits / list.length) * 10) / 10 : 0;
  // عدّادات الحملة الفعلية من القاعدة — الحملة تُرسَل للشريحة كاملة في
  // الخادم، وكان العدّ من شريحة الـ٥٠٠ المعروضة فقط: مالكٌ عنده ٣٠٠٠ عميل
  // يقرأ «ستصل ٥٠٠» ثم تصل ٣٠٠٠ هدية ممولة. عبر RPC (0208) بمسحةٍ واحدة
  // لا خمس HEAD count منفصلة — تلك كانت تمرّ بـRLS فتتجمّد لمطعمٍ ضخم.
  const dormantSince = new Date(cutoff30).toISOString();
  const { data: pageCounts } = await supabase
    .rpc("customers_page_counts", { p_restaurant_id: restaurant.id, p_dormant_since: dormantSince })
    .maybeSingle();
  const campaignCounts = {
    all: pageCounts?.all_count ?? segCounts.all,
    vip: pageCounts?.vip_count ?? segCounts.vip,
    returning: pageCounts?.returning_count ?? 0,
    new: pageCounts?.new_count ?? 0,
    dormant: pageCounts?.dormant_count ?? 0,
  };
  // نفس السبب: شريحتا «الكل» و«VIP» المعروضتان أعلى الصفحة وفي شرائح
  // الفلترة كانتا تُشتقّان من طول قائمة الـ٥٠٠ المعروضة، فمطعمٌ يفوق
  // عملاؤه ٥٠٠ كان يرى عددًا ثابتًا لا يتحرّك مهما كبر عدده الحقيقي.
  segCounts.all = campaignCounts.all;
  segCounts.vip = campaignCounts.vip;

  // شرائح المالك المخصّصة بعدّاداتها — العضوية تُحسب في القاعدة لحظةَ الاستعلام
  const { data: segRows, error: segError } = await supabase.rpc("customer_segments_with_counts", {
    p_restaurant_id: restaurant.id,
  });
  if (segError) console.error("[CustomersPage] customer_segments_with_counts", segError.message);
  // الأنواع المولَّدة تعلن الأعمدة الاختيارية غير قابلة للعدم — القاعدة تعيدها null
  const customSegments = ((segRows ?? []) as CustomSegment[]);

  const hrefFor = (s: Segment) => `/dashboard/customers?seg=${s}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  const hrefForPage = (p: number) =>
    `/dashboard/customers?page=${p}${seg !== "all" ? `&seg=${seg}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <div className="space-y-6">
        <ScreenGuide
          lang={lang}
          anchor="owner"
          lines={[
            tr(lang, "ابحث بالاسم أو الرقم، وصفِّ عملاءك بشرائح جاهزة.", "Search by name or number, and filter customers by ready-made segments."),
            tr(lang, "أرسل هديّةً أو خصمًا لشريحةٍ كاملة — والعدد يظهر قبل الإرسال.", "Send a gift or discount to a whole segment — the reach shows before you send."),
            tr(lang, "هديّة الاسترجاع تعمل وحدها ليلًا لمن غاب مدّةً تحدّدها.", "The win-back gift runs nightly on its own for whoever has been away as long as you set."),
          ]}
        />
        <div className="grid grid-cols-3 gap-3">
          <Kpi label={tr(lang, "عملاؤك", "Your customers")} value={toAr(segCounts.all)} tone="var(--brand-d)" />
          <Kpi label={tr(lang, "مميّزون (VIP)", "VIPs")} value={toAr(segCounts.vip)} tone="var(--st-open)" />
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

        <SegmentsManager segments={customSegments} />

        <CampaignForm counts={campaignCounts} customSegments={customSegments} />

        <WinbackForm initial={winback} />

        {list.length === 0 ? (
          <div className="soft-card py-10 text-center">
            {/* خطأ الجلب له رسالته الخاصة، لا "لا يوجد عملاء بعد" — تلك كذبة
                حين يكون السبب فشل استعلامٍ لا غياب بيانات (كما حدث فعليًّا
                هذه الليلة قبل 0213) */}
            <p className="text-2xl">{rowsError ? "⚠️" : "👥"}</p>
            <p className="mt-2 font-bold text-[color:var(--ink)]">
              {rowsError
                ? tr(lang, "تعذّر تحميل العملاء", "Couldn't load customers")
                : q || seg !== "all" ? tr(lang, "لا نتائج مطابقة", "No matching results") : tr(lang, "لا يوجد عملاء بعد", "No customers yet")}
            </p>
            <p className="mt-1 text-sm text-[color:var(--muted)]">
              {rowsError
                ? tr(lang, "حدث خطأ مؤقّت — أعد تحميل الصفحة.", "A temporary error occurred — reload the page.")
                : q || seg !== "all"
                ? tr(lang, "جرّب بحثًا آخر أو شريحة أخرى.", "Try another search or segment.")
                : tr(lang, "تظهر الملفّات تلقائيًا عند إجلاس العملاء من الطابور.", "Profiles appear automatically when customers are seated from the queue.")}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {list.map((p) => {
              const name = p.full_name ?? tr(lang, "عميل", "Customer");
              return (
                <li key={p.customer_id} className="soft-card p-4">
                  <Link href={`/dashboard/customers/${p.customer_id}`} className="flex items-center gap-3">
                    <span
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl font-display text-lg font-bold"
                      style={{ background: "var(--surface-2)", color: "var(--brand-solid)" }}
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
                      <p className="text-sm text-[color:var(--muted)]" dir="ltr">{p.phone ?? "—"}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[color:var(--muted)]">
                        <span>{tr(lang, `${toAr(p.visits)} زيارة`, `${toAr(p.visits)} visits`)}</span>
                        <span>· {tr(lang, `آخر زيارة ${daysAgoLabel(p.last_visit, "ar")}`, `Last visit ${daysAgoLabel(p.last_visit, "en")}`)}</span>
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
                    note={p.note}
                    visits={p.visits}
                  />
                </li>
              );
            })}
          </ul>
        )}

        {/* تنقّلٌ بين الصفحات: يظهر فقط في شريحة «الكل» بلا فلترةٍ محليّة،
            لأنّ شرائح مثل «مميّزون» تُصفَّى في الذاكرة على صفٍّ واحد جُلب
            من القاعدة، فترقيمها المستقل يحتاج استعلامًا مختلفًا لا يوجد بعد. */}
        {seg === "all" && totalPages > 1 && (
          <div className="flex items-center justify-between gap-2 pt-1">
            {page > 1 ? (
              <Link href={hrefForPage(page - 1)} className="btn btn-secondary px-4 text-sm">
                {tr(lang, "→ أحدث", "→ Previous")}
              </Link>
            ) : <span />}
            <span className="text-xs font-bold text-[color:var(--muted)]">
              {tr(lang, `صفحة ${toAr(page)} من ${toAr(totalPages)}`, `Page ${page} of ${totalPages}`)}
            </span>
            {page < totalPages ? (
              <Link href={hrefForPage(page + 1)} className="btn btn-secondary px-4 text-sm">
                {tr(lang, "أقدم ←", "Next ←")}
              </Link>
            ) : <span />}
          </div>
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
