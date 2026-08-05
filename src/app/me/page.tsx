"use client";

import Link from "next/link";
import { CustomerShell } from "@/components/customer-shell";
import { LangToggle } from "@/components/lang-toggle";
import { RewardsBadge } from "./rewards-badge";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

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

// ثلاثة بنود فقط بقرار المالك: الهدايا والمفضلة والزيارات — الباقي في الدرج الجانبي
const ITEMS = [
  { href: "/me/rewards", ar: "الهدايا", en: "Gifts", Icon: IcGift },
  { href: "/me/favorites", ar: "المفضّلة", en: "Favorites", Icon: IcHeart },
  { href: "/me/visits", ar: "الزيارات", en: "Visits", Icon: IcClock },
];

// «حسابي» أحد تبويبَي الشريط السفلي؛ كان الوحيد الذي يذهب للخادم في كل
// ضغطة — لا لبياناتٍ فيه، بل لقراءة كوكي اللغة فقط. صار مكوّن عميل ثابتًا
// فيُجلَب مسبقًا وينتقل إليه الشريط بلا رحلة، كإحساس التطبيقات المثبَّتة.
export default function MePage() {
  const lang = useLang();
  return (
    <CustomerShell active="other" search={false}>
      <div className="space-y-5">
        <div className="rq-card flex items-center gap-4 p-5">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-800 font-display text-2xl text-cream-100">✦</span>
          <div>
            <p className="font-display text-lg font-bold text-[color:var(--ink)]">{tr(lang, "مرحبًا بك في إيت", "Welcome to EIGHT")}</p>
            <p className="text-sm text-[color:var(--muted)]">{tr(lang, "تستخدم إيت كضيف — بلا حساب ولا كلمة مرور.", "You're using EIGHT as a guest — no account, no password.")}</p>
          </div>
        </div>

        <div className="rq-card divide-y divide-[color:var(--border)] overflow-hidden p-0">
          {ITEMS.map((it) => (
            <Link key={it.href} href={it.href} className="flex items-center gap-3.5 px-5 py-4 transition active:bg-[color:var(--surface-2)]">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-cream-100"
                style={{ background: "var(--brand-solid)" }}
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
          <p className="mt-0.5 text-sm text-[color:var(--muted)]">{tr(lang, "انضمّ إلى إيت وابدأ بإدارة طابورك وحجوزاتك.", "Join EIGHT and start managing your queue and reservations.")}</p>
          <Link href="/partners" className="rq-btn-soft mt-3 inline-flex">{tr(lang, "بوابة الشركاء ←", "Partners portal ←")}</Link>
        </div>
      </div>
    </CustomerShell>
  );
}
