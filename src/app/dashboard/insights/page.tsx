import Link from "next/link";
import { loadOwner } from "../owner-context";
import { DismissInsight } from "../dismiss-insight";
import { getLang } from "@/lib/i18n-server";
import { ScreenGuide } from "@/components/screen-guide";
import { tr } from "@/lib/i18n";
import { fmtDateTime } from "@/lib/dates";

/**
 * صفحة الرؤى والتنبيهات.
 *
 * كانت تُعرض داخل لوحة التحكّم فتعترض المالك قبل أن يصل إلى ما جاء لأجله،
 * وتقتطع أربعًا ويضيع الباقي بلا مكانٍ يجمعه. صارت وجهةً يقصدها، وتعرض
 * المقروء وغير المقروء معًا.
 */
type Insight = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  data: { customer_id?: string } | null;
  created_at: string;
  is_read: boolean;
};

export default async function InsightsPage() {
  const lang = await getLang();
  const load = await loadOwner();
  if (load.state !== "ok") return null;
  const { supabase, restaurant } = load.ctx;

  const { data } = await supabase
    .from("owner_insights")
    .select("id, kind, title, body, data, created_at, is_read")
    .eq("restaurant_id", restaurant.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = (data ?? []) as Insight[];
  const unread = rows.filter((r) => !r.is_read);
  const read = rows.filter((r) => r.is_read);

  const Row = ({ it, dim }: { it: Insight; dim?: boolean }) => (
    <li className={`flex items-start gap-3 py-3.5${dim ? " opacity-60" : ""}`}>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-[color:var(--ink)]">{it.title}</p>
        {it.body && <p className="mt-0.5 text-sm leading-6 text-[color:var(--muted)]">{it.body}</p>}
        <p className="mt-1 text-xs font-medium text-[color:var(--muted)]">{fmtDateTime(it.created_at, lang)}</p>
        {/* بصيرةٌ بلا فعل نشرةٌ لا أداة — كل نوعٍ يحمل فعله */}
        {it.kind === "walkaway" && it.data?.customer_id && (
          <Link
            href={`/dashboard/customers/${it.data.customer_id}`}
            className="mt-1.5 inline-block text-xs font-bold text-[color:var(--brand-d)] underline decoration-2 underline-offset-4"
          >
            {/* «وأهدِه هدية عودة» حُذفت بطلب المشغّل — وجدها مبتذلة */}
            {tr(lang, "افتح ملفه ←", "Open profile ←")}
          </Link>
        )}
      </div>
      {!it.is_read && <DismissInsight id={it.id} />}
    </li>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-[color:var(--ink)]">
          {tr(lang, "رؤى وتنبيهات", "Insights & alerts")}
        </h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          {tr(lang, "ملخّصاتك اليومية ومن انصرف قبل دوره.", "Your daily digests and who walked away before their turn.")}
        </p>
      </div>
      <ScreenGuide
        lang={lang}
        anchor="owner"
        lines={[
          tr(lang, "الرؤى والتنبيهات التي يكتبها النظام لك تلقائيًّا.", "The insights and alerts the system writes for you automatically."),
          tr(lang, "غير المقروء أعلى، والسابق تحته باهتًا.", "Unread sits on top; earlier ones below it, dimmed."),
          tr(lang, "من انصرف قبل دوره تفتح ملفّه من السطر مباشرةً.", "For someone who walked away before their turn, open their file straight from the row."),
        ]}
      />

      {rows.length === 0 ? (
        <div className="soft-card p-10 text-center">
          <p className="text-sm text-[color:var(--muted)]">
            {tr(lang, "لا توجد رؤى بعد — تصلك تلقائيًّا مع أول يوم عمل.", "No insights yet — they arrive automatically after your first working day.")}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {unread.length > 0 && (
            <section className="soft-card px-5 py-1">
              <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
                {unread.map((it) => <Row key={it.id} it={it} />)}
              </ul>
            </section>
          )}

          {read.length > 0 && (
            <section>
              <h2 className="mb-2 px-1 font-display text-sm font-bold text-[color:var(--muted)]">
                {tr(lang, "سابقة", "Earlier")}
              </h2>
              <div className="soft-card px-5 py-1">
                <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {read.map((it) => <Row key={it.id} it={it} dim />)}
                </ul>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
