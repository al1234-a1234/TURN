import { CustomerShell } from "@/components/customer-shell";
import { getLang } from "@/lib/i18n-server";
import { tr } from "@/lib/i18n";

export const metadata = { title: "تواصل معنا · EIGHT" };

export default async function ContactPage() {
  const lang = await getLang();
  const channels = [
    { icon: "✉️", ar: "البريد", en: "Email", value: "perakas66@gmail.com", href: "mailto:perakas66@gmail.com" },
    { icon: "📱", ar: "الجوّال", en: "Phone", value: "0506089164", href: "tel:0506089164" },
  ];
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
          {channels.map((c) => (
            <a key={c.ar} href={c.href} className="rq-card flex items-center gap-3 p-4 transition active:scale-[0.99]">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl text-xl" style={{ background: "var(--brand-solid)" }}>
                <span>{c.icon}</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-bold text-[color:var(--ink)]">{tr(lang, c.ar, c.en)}</p>
                <p dir="ltr" className="truncate text-start text-sm text-[color:var(--muted)]">{c.value}</p>
              </div>
              <span className="text-[color:var(--muted)]">←</span>
            </a>
          ))}
        </div>
      </div>
    </CustomerShell>
  );
}
