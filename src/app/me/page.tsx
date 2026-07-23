import Link from "next/link";
import { CustomerShell } from "@/components/customer-shell";
import { LangToggle } from "@/components/lang-toggle";
import { getLang } from "@/lib/i18n-server";
import { tr } from "@/lib/i18n";

export const metadata = { title: "حسابي · دور" };

const ITEMS = [
  { href: "/me/waitlist", ar: "اشتراكاتي في الطوابير", en: "My queue subscriptions", icon: "⏱️" },
  { href: "/me/favorites", ar: "المفضّلة", en: "Favorites", icon: "❤️" },
  { href: "/diaries", ar: "يومياتي", en: "My diary", icon: "📔" },
  { href: "/about", ar: "من نحن", en: "About us", icon: "ℹ️" },
  { href: "/contact", ar: "تواصل معنا", en: "Contact us", icon: "💬" },
];

export default async function MePage() {
  const lang = await getLang();
  return (
    <CustomerShell title={tr(lang, "أخرى", "Other")} active="other" search={false}>
      <div className="space-y-5">
        <div className="rq-card flex items-center gap-4 p-5">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-800 font-display text-2xl text-cream-100">✦</span>
          <div>
            <p className="font-display text-lg font-bold text-[color:var(--ink)]">{tr(lang, "مرحبًا بك في دور", "Welcome to Turn")}</p>
            <p className="text-sm text-[color:var(--muted)]">{tr(lang, "تستخدم دور كضيف — بلا حساب ولا كلمة مرور.", "You're using Turn as a guest — no account, no password.")}</p>
          </div>
        </div>

        <div className="rq-card divide-y divide-[color:var(--border)] overflow-hidden p-0">
          {ITEMS.map((it) => (
            <Link key={it.href} href={it.href} className="flex items-center gap-3 px-5 py-4 transition active:bg-[color:var(--surface-2)]">
              <span className="text-xl">{it.icon}</span>
              <span className="flex-1 font-bold text-[color:var(--ink)]">{tr(lang, it.ar, it.en)}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[color:var(--muted)]"><path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </Link>
          ))}
        </div>

        <div className="rq-card flex items-center justify-between p-5">
          <span className="font-bold text-[color:var(--ink)]">{tr(lang, "اللغة", "Language")}</span>
          <LangToggle variant="plain" />
        </div>

        <div className="rq-card p-5">
          <p className="font-display text-sm font-bold text-[color:var(--ink)]">{tr(lang, "عندك مطعم؟", "Own a restaurant?")}</p>
          <p className="mt-0.5 text-sm text-[color:var(--muted)]">{tr(lang, "انضمّ إلى دور وابدأ بإدارة طابورك وحجوزاتك.", "Join Turn and start managing your queue and reservations.")}</p>
          <Link href="/partners" className="rq-btn-soft mt-3 inline-flex">{tr(lang, "بوابة الشركاء ←", "Partners portal ←")}</Link>
        </div>
      </div>
    </CustomerShell>
  );
}
