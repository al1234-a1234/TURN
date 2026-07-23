import { CustomerShell } from "@/components/customer-shell";
import { getLang } from "@/lib/i18n-server";
import { tr } from "@/lib/i18n";

export const metadata = { title: "تواصل معنا · دور" };

export default async function ContactPage() {
  const lang = await getLang();
  const channels = [
    { icon: "✉️", ar: "البريد", en: "Email", value: "albraalaan@gmail.com", href: "mailto:albraalaan@gmail.com" },
    { icon: "🤝", ar: "انضمّ كشريك", en: "Join as a partner", value: tr(lang, "أضِف مطعمك إلى دور", "Add your restaurant to Turn"), href: "/partners" },
  ];
  return (
    <CustomerShell title={tr(lang, "تواصل معنا", "Contact")} active="other" search={false}>
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
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl text-xl" style={{ background: "linear-gradient(155deg,#a8371a,#661c0a)" }}>
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
