import { CustomerShell } from "@/components/customer-shell";
import { Logo } from "@/components/logo";
import { getLang } from "@/lib/i18n-server";
import { tr } from "@/lib/i18n";

export const metadata = { title: "من نحن · إيت" };

export default async function AboutPage() {
  const lang = await getLang();
  const features = [
    { icon: "⏱️", ar: "طابور ذكي بلا حساب", en: "Smart queue, no account", arD: "خذ دورك من جوّالك وتابع موقعك لحظيًا دون تسجيل.", enD: "Take your turn from your phone and track your spot live — no sign-up." },
    { icon: "📅", ar: "حجوزات مسبقة", en: "Advance reservations", arD: "احجز طاولتك قبل الحضور، منفصلة عن طابور الحضور.", enD: "Book your table ahead of time, separate from the walk-in queue." },
    { icon: "🎁", ar: "هدايا المطاعم", en: "Restaurant gifts", arD: "هدايا يمنحها لك المطعم — تجدها في حسابك وتستعملها متى شئت.", enD: "Gifts the restaurant grants you — in your account, used whenever you like." },
  ];
  return (
    <CustomerShell active="other" search={false}>
      <div className="space-y-5">
        <div className="rq-card flex flex-col items-center gap-3 p-8 text-center">
          <Logo size={96} />
          <h1 className="font-display text-2xl font-bold text-[color:var(--ink)]">{tr(lang, "إيت — EIGHT", "EIGHT — إيت")}</h1>
          <p className="max-w-md text-sm leading-relaxed text-[color:var(--muted)]">
            {tr(
              lang,
              "منصّة سعودية تجمع طابور الانتظار والحجوزات وأدوات التسويق للمطاعم في مكان واحد — تجربة أسرع للعميل وأدوات أقوى للمالك.",
              "A Saudi platform that brings waitlists, reservations, and restaurant marketing tools together in one place — a faster experience for guests and stronger tools for owners.",
            )}
          </p>
        </div>

        <div className="space-y-3">
          {features.map((f) => (
            <div key={f.ar} className="rq-card flex items-start gap-3 p-4">
              <span className="text-2xl">{f.icon}</span>
              <div>
                <p className="font-display text-base font-bold text-[color:var(--ink)]">{tr(lang, f.ar, f.en)}</p>
                <p className="mt-0.5 text-sm text-[color:var(--muted)]">{tr(lang, f.arD, f.enD)}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="pt-2 text-center text-xs text-[color:var(--muted)]">
          {tr(lang, "صُنع بشغف في السعودية 🇸🇦", "Made with passion in Saudi Arabia 🇸🇦")}
        </p>
      </div>
    </CustomerShell>
  );
}
