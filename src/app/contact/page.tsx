import { CustomerShell } from "@/components/customer-shell";
import { getLang } from "@/lib/i18n-server";
import { tr } from "@/lib/i18n";

export const metadata = { title: "تواصل معنا · EIGHT" };

// رقم المنصّة الموحّد (لا رقم شخصي). بلا "+" هنا لأن wa.me يتطلّب أرقامًا صرفة،
// ونشتقّ منه صيغتَي tel: وwa.me أدناه بدل تكراره حرفيًّا في مكانين قد يختلفان.
const PHONE_INTL = "966533237839";
const PHONE_DISPLAY = "+966 53 323 7839";
const WA_MESSAGE = "مرحبًا، أتواصل معكم بخصوص [اكتب استفسارك/طلب انضمام مطعم/شكواك هنا] 🙏";
// wa.me يتعرّف الوجهة تلقائيًّا: يفتح تطبيق واتساب على الجوّال، وواتساب ويب
// على المتصفّح — بلا حاجة لتفريعٍ يدويّ بين الحالتين.
const WA_HREF = `https://wa.me/${PHONE_INTL}?text=${encodeURIComponent(WA_MESSAGE)}`;

export default async function ContactPage() {
  const lang = await getLang();

  return (
    <CustomerShell active="none" search={false}>
      <div className="space-y-5">
        <div className="rq-card p-7 text-center">
          <span className="text-4xl">💬</span>
          <h1 className="mt-3 font-display text-xl font-bold text-[color:var(--ink)]">{tr(lang, "نحبّ نسمع منك", "We'd love to hear from you")}</h1>
          <p className="mt-1.5 text-sm text-[color:var(--muted)]">
            {tr(lang, "أي سؤال أو اقتراح أو رغبة بإضافة مطعمك — تواصل معنا.", "Any question, suggestion, or a wish to add your restaurant — reach out.")}
          </p>
        </div>

        <div className="space-y-3">
          <a href="mailto:perakas66@gmail.com" className="rq-card flex items-center gap-3 p-4 transition active:scale-[0.99]">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl text-xl" style={{ background: "var(--brand-solid)" }}>
              <span>✉️</span>
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-bold text-[color:var(--ink)]">{tr(lang, "البريد", "Email")}</p>
              <p dir="ltr" className="truncate text-start text-sm text-[color:var(--muted)]">perakas66@gmail.com</p>
            </div>
            <span className="text-[color:var(--muted)]">←</span>
          </a>

          <div className="rq-card p-4">
            <p className="px-1 pb-3 text-xs leading-relaxed text-[color:var(--muted)]">
              {tr(
                lang,
                "رقم المنصّة الموحّد — لأي استفسار عام، طلب اشتراك مطعمك بالمنصّة، أو شكوى وملاحظة.",
                "The platform's single number — for any general inquiry, a request to join the platform, or a complaint or piece of feedback."
              )}
            </p>

            <div className="flex items-center gap-3">
              <a href={`tel:+${PHONE_INTL}`} className="flex min-w-0 flex-1 items-center gap-3 py-1.5 transition active:scale-[0.99]">
                <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl text-xl" style={{ background: "var(--brand-solid)" }}>
                  <span>📱</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-bold text-[color:var(--ink)]">{tr(lang, "الجوّال", "Phone")}</p>
                  <p dir="ltr" className="truncate text-start text-sm text-[color:var(--muted)]">{PHONE_DISPLAY}</p>
                </div>
              </a>

              <a
                href={WA_HREF}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={tr(lang, "تواصل عبر واتساب", "Chat on WhatsApp")}
                className="flex h-11 w-11 flex-none items-center justify-center rounded-full transition active:scale-[0.94]"
                style={{ background: "#25D366" }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
                  <path d="M12.04 2c-5.5 0-9.96 4.46-9.96 9.96 0 1.76.46 3.48 1.34 5L2 22l5.2-1.36a9.94 9.94 0 0 0 4.84 1.23h.004c5.5 0 9.96-4.46 9.96-9.96S17.54 2 12.04 2zm0 18.2h-.003a8.24 8.24 0 0 1-4.2-1.15l-.3-.18-3.1.81.83-3.02-.2-.31a8.2 8.2 0 0 1-1.26-4.4c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.55-3.7 8.24-8.24 8.24zm4.52-6.17c-.25-.12-1.47-.72-1.7-.81-.23-.08-.4-.12-.56.13-.17.25-.65.81-.79.97-.15.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.38.11-.51.11-.11.25-.29.37-.44.12-.15.16-.25.25-.42.08-.17.04-.31-.02-.44-.06-.12-.56-1.36-.77-1.86-.2-.49-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.87.85-.87 2.08 0 1.22.89 2.4 1.02 2.57.12.17 1.75 2.67 4.24 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.55.1.47-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.15-1.18-.06-.1-.23-.16-.48-.28z" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </CustomerShell>
  );
}
