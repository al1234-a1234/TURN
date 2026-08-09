import { CustomerShell } from "@/components/customer-shell";
import { getLang } from "@/lib/i18n-server";
import { tr } from "@/lib/i18n";

export const metadata = { title: "سياسة الخصوصية · إيت" };

/* إفصاح واضح بما نجمعه ولماذا — المنصّة تجمع أسماء وأرقام جوالات وتحسب
   مسافة تقريبية، ونظام حماية البيانات الشخصية السعودي (PDPL) يستوجب
   إعلام صاحب البيانات. الصياغة تطابق سلوك الكود الفعلي حرفيًّا
   (لا نعد بما لا نفعله، ولا نُخفي ما نفعله). */
export default async function PrivacyPage() {
  const lang = await getLang();
  const sections = [
    {
      ar: "وش نجمع؟",
      en: "What we collect",
      arB: [
        "الاسم ورقم الجوّال: عند أخذ دور أو تسجيل زيارة — يحتاجهما المطعم لمناداتك وتأكيد زيارتك.",
        "المسافة التقريبية عن الفرع فقط عند أخذ الدور: نحسبها من موقعك لحظة الطلب ونخزّن الناتج (مثل: يبعد ٢ كم) — لا نخزّن إحداثيات موقعك نفسها أبدًا.",
        "سجل زياراتك وتقييماتك في المطاعم التي زرتها فعلًا.",
      ],
      enB: [
        "Name and mobile number: when taking a turn or logging a visit — the restaurant needs them to call you and confirm your visit.",
        "Approximate distance to the branch only when taking a turn: computed from your location at that moment; we store the result (e.g., 2 km away) — never your coordinates.",
        "Your visit history and reviews at restaurants you actually visited.",
      ],
    },
    {
      ar: "وش ما نجمع؟",
      en: "What we don't collect",
      arB: [
        "لا نخزّن إحداثيات موقعك.",
        "لا نجمع بيانات دفع — المنصّة بلا مدفوعات داخلية.",
        "لا نبيع بياناتك ولا نشاركها مع أي طرف ثالث للتسويق.",
      ],
      enB: [
        "We never store your location coordinates.",
        "No payment data — the platform has no in-app payments.",
        "We never sell your data or share it with third parties for marketing.",
      ],
    },
    {
      ar: "مين يشوف بياناتك؟",
      en: "Who sees your data",
      arB: [
        "المطعم الذي أخذت دورًا فيه يرى اسمك ورقمك ومسافتك التقريبية — للفرع الذي زرته فقط.",
        "هداياك يراها المطعم المانح لها فقط.",
      ],
      enB: [
        "The restaurant where you took a turn sees your name, number, and approximate distance — only for the branch you visited.",
        "Your gifts are visible only to the restaurant that granted them.",
      ],
    },
    {
      ar: "حقوقك",
      en: "Your rights",
      arB: [
        "تقدر تطلب حذف بياناتك أو تصحيحها في أي وقت عبر صفحة تواصل معنا.",
        "الإشعارات اختيارية بالكامل وتقدر توقفها من إعدادات متصفحك متى شئت.",
      ],
      enB: [
        "You can request deletion or correction of your data any time via the Contact page.",
        "Notifications are fully optional and can be turned off from your browser settings whenever you want.",
      ],
    },
  ];

  return (
    <CustomerShell active="none" search={false}>
      <div className="space-y-4">
        <div className="rq-card p-6">
          <h1 className="font-display text-2xl font-bold text-[color:var(--ink)]">{tr(lang, "سياسة الخصوصية", "Privacy Policy")}</h1>
          <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
            {tr(lang,
              "بياناتك أمانة. هذي الصفحة تشرح بدقة وش نجمع ووش ما نجمع — بلا لغة قانونية معقّدة.",
              "Your data is a trust. This page explains exactly what we collect and what we don't — no complicated legalese.")}
          </p>
        </div>
        {sections.map((s) => (
          <div key={s.ar} className="rq-card p-5">
            <h2 className="font-display text-lg font-bold text-[color:var(--ink)]">{tr(lang, s.ar, s.en)}</h2>
            <ul className="mt-2 space-y-2">
              {(lang === "en" ? s.enB : s.arB).map((b) => (
                <li key={b} className="flex items-start gap-2 text-sm leading-6 text-[color:var(--muted)]">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--brand-d)" }} />
                  {b}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="px-2 text-xs text-[color:var(--muted)]">
          {tr(lang, "آخر تحديث: ٣٠ يوليو ٢٠٢٦", "Last updated: July 30, 2026")}
        </p>
      </div>
    </CustomerShell>
  );
}
