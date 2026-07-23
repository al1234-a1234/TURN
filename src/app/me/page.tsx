import Link from "next/link";
import { CustomerShell } from "@/components/customer-shell";
import { LangToggle } from "@/components/lang-toggle";
import { RewardsBadge } from "./rewards-badge";
import { getLang } from "@/lib/i18n-server";
import { tr } from "@/lib/i18n";

export const metadata = { title: "حسابي · دور" };

/* أيقونات الهوية — دائرة كريميّة بلون الهوية داخلها رمز الدلالة */
function IcGift() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3.5" y="8.5" width="17" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5 13.5V19a1.5 1.5 0 001.5 1.5h11A1.5 1.5 0 0019 19v-5.5M12 8.5v12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M12 8.5S10.8 4 8.6 4c-1.3 0-2 .9-2 1.9C6.6 7.6 9 8.5 12 8.5zm0 0S13.2 4 15.4 4c1.3 0 2 .9 2 1.9C17.4 7.6 15 8.5 12 8.5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}
function IcClock() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IcHeart() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 20s-7-4.3-9-8.4C1.6 8.4 3 5.4 6 5.4c2 0 3.2 1.4 4 2.6.8-1.2 2-2.6 4-2.6 3 0 4.4 3 3 6.2C19 15.7 12 20 12 20z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}
function IcBook() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 5.5A1.5 1.5 0 016.5 4H18a1 1 0 011 1v13.5a1 1 0 01-1 1H6.5A1.5 1.5 0 015 18V5.5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M8.5 8.5h6M8.5 12h6M8.5 15.5h3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
function IcInfo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 11v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12" cy="7.8" r="1.05" fill="currentColor" />
    </svg>
  );
}
function IcChat() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4.5 6.5A1.5 1.5 0 016 5h12a1.5 1.5 0 011.5 1.5v8A1.5 1.5 0 0118 16H9l-4 3.2V6.5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M8.5 10h7M8.5 12.6h4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

const ITEMS = [
  { href: "/me/rewards", ar: "هداياي وخصوماتي", en: "My rewards & discounts", Icon: IcGift },
  { href: "/me/waitlist", ar: "اشتراكاتي في الطوابير", en: "My queue subscriptions", Icon: IcClock },
  { href: "/me/favorites", ar: "المفضّلة", en: "Favorites", Icon: IcHeart },
  { href: "/diaries", ar: "يومياتي", en: "My diary", Icon: IcBook },
  { href: "/about", ar: "من نحن", en: "About us", Icon: IcInfo },
  { href: "/contact", ar: "تواصل معنا", en: "Contact us", Icon: IcChat },
];

export default async function MePage() {
  const lang = await getLang();
  return (
    <CustomerShell active="other" search={false}>
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
            <Link key={it.href} href={it.href} className="flex items-center gap-3.5 px-5 py-4 transition active:bg-[color:var(--surface-2)]">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-brand-800"
                style={{ background: "linear-gradient(160deg,#fbf1ea,#f4ddd0)", border: "1px solid rgba(102,28,10,0.12)" }}
              >
                <it.Icon />
              </span>
              <span className="flex-1 font-bold text-[color:var(--ink)]">{tr(lang, it.ar, it.en)}</span>
              {it.href === "/me/rewards" && <RewardsBadge />}
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
