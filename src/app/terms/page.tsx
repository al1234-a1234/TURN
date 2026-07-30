import { CustomerShell } from "@/components/customer-shell";
import { getLang } from "@/lib/i18n-server";
import { tr } from "@/lib/i18n";

export const metadata = { title: "شروط الاستخدام · دور" };

/* شروط مختصرة صادقة تطابق سلوك المنتج الفعلي — تحمي المنصّة (الدور تنظيم
   انتظار لا التزام قانوني بطاولة، والمطعم مسؤول عن خدمته) وتحمي العميل
   (بلا رسوم، بلا مفاجآت). */
export default async function TermsPage() {
  const lang = await getLang();
  const sections = [
    {
      ar: "وش هي دور؟",
      en: "What is Turn?",
      arB: [
        "منصّة تنظّم طوابير الانتظار والحجوزات بين العميل والمطعم. المطعم هو من يقدّم الخدمة والطعام — دور وسيط تنظيمي فقط.",
        "استخدام المنصّة للعملاء مجاني بالكامل، وبلا أي مدفوعات داخل المنصّة.",
      ],
      enB: [
        "A platform that organizes waitlists and reservations between guests and restaurants. The restaurant provides the service and food — Turn is an organizing intermediary only.",
        "The platform is completely free for guests, with no in-app payments.",
      ],
    },
    {
      ar: "الدور والانتظار",
      en: "Turns & waiting",
      arB: [
        "الدور تنظيم لترتيب الدخول، وليس التزامًا قانونيًّا بطاولة في وقت محدد — الترتيب النهائي والإجلاس قرار المطعم.",
        "أخذ الدور يتطلب مشاركة موقعك لحظة الطلب للتأكد أنك قريب فعلًا — يُحسب منه المسافة فقط ولا يُخزَّن.",
        "المطعم قد يتجاوز دورك إذا نُوديت ولم تحضر خلال المهلة المتعارف عليها.",
      ],
      enB: [
        "A turn organizes entry order; it is not a legal commitment to a table at a specific time — final seating is the restaurant's decision.",
        "Taking a turn requires sharing your location at that moment to confirm you're actually nearby — only the distance is computed, and it isn't stored.",
        "The restaurant may skip your turn if you're called and don't show up within the customary window.",
      ],
    },
    {
      ar: "الاستخدام العادل",
      en: "Fair use",
      arB: [
        "يُمنع أخذ أدوار وهمية أو بأرقام غير حقيقية أو كتابة تقييمات لزيارات لم تحدث.",
        "المنصّة تقيّد المحاولات المتكررة المشبوهة تلقائيًّا حمايةً للمطاعم والعملاء الحقيقيين.",
      ],
      enB: [
        "Fake turns, unreal numbers, and reviews for visits that never happened are prohibited.",
        "The platform automatically limits suspicious repeated attempts to protect restaurants and real guests.",
      ],
    },
    {
      ar: "الهدايا والمكافآت",
      en: "Gifts & rewards",
      arB: [
        "الهدايا والنقاط يحدّدها ويموّلها المطعم المانح، وهو المسؤول عن الوفاء بها، ولها شروطها وحدودها المعروضة معها.",
      ],
      enB: [
        "Gifts and points are defined and funded by the granting restaurant, which is responsible for honoring them, per the conditions and limits shown with each.",
      ],
    },
  ];

  return (
    <CustomerShell active="other" search={false}>
      <div className="space-y-4">
        <div className="rq-card p-6">
          <h1 className="font-display text-2xl font-bold text-[color:var(--ink)]">{tr(lang, "شروط الاستخدام", "Terms of Use")}</h1>
          <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
            {tr(lang, "باستخدامك دور فأنت توافق على هذي الشروط المختصرة.", "By using Turn you agree to these brief terms.")}
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
