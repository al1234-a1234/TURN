"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Logo, Wordmark } from "@/components/logo";
import { LiveTicketBar } from "@/components/live-ticket-bar";
import { SharedHeader } from "@/components/page-header";
import { useLang } from "@/components/lang-provider";
import { tr } from "@/lib/i18n";
import { LangToggle } from "@/components/lang-toggle";

/* أيقونات صغيرة */
function IcSearch() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.2" />
      <path d="M20 20l-3.4-3.4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
function IcRestaurants() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M7 3v7a2 2 0 002 2v9h-2v-9M5 3v4M9 3v4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M16 3c-1.5 0-2.5 2-2.5 4.5S14.5 12 16 12v9" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}
function IcAccount() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="3.6" stroke="currentColor" strokeWidth="1.9" />
      <path d="M4.8 20c.6-3.6 3.6-5.6 7.2-5.6s6.6 2 7.2 5.6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

// الدرج صار للتعريف والأنظمة وحدها: دوري وحجزي والهدايا والزيارات
// والمفضّلة كانت هنا روابطَ إلى صفحاتٍ منفصلة، وقد صارت كلّها داخل
// «حسابي» في الشريط السفلي. وبابان إلى الشيء نفسه ليس خيارًا، بل حَيرة.
const DRAWER = [
  { label: "من نحن", en: "About Us", href: "/about" },
  { label: "تواصل معنا", en: "Contact Us", href: "/contact" },
  { label: "سياسة الخصوصية", en: "Privacy Policy", href: "/privacy" },
  { label: "شروط الاستخدام", en: "Terms of Use", href: "/terms" },
];

export function CustomerShell({
  active = "restaurants",
  search = true,
  children,
}: {
  /** ‏"none" لصفحات الدرج (من نحن، الخصوصية…): لا تنتمي إلى تبويبٍ فتُضيئه كذبًا */
  active?: "restaurants" | "other" | "none";
  search?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // شريط التذكرة يعلو الشريط السفلي، فيأكل من المحتوى سطرًا. والحشو يعرف
  // بظهوره كي لا يختفي آخرُ مطعمٍ في القائمة تحته.
  const [hasLive, setHasLive] = useState(false);
  const onLiveShow = useCallback((shown: boolean) => setHasLive(shown), []);
  const lang = useLang();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* الهيدر — يمين: الشعار (يفتح القائمة) · وسط: EIGHT · يسار: بحث */}
      <SharedHeader>
        {/* الشعار الكامل (٨ + EIGHT) داخل لوحه الخاص — لا يُلبَس زرّ rq-circle
            فوقه: كان مربّعين متراكبين بزاويتَين مختلفتَين (لوح الشعار ٢٢٫٨٪
            نصف قطر، وrq-circle ١rem) بلا فراغٍ بينهما، فتتصادم الحافّتان
            عند كل ركن وتبين «أطرافًا غريبة». اللوح وحده كافٍ بصريًّا. */}
        <button
          onClick={() => setOpen(true)}
          aria-label={tr(lang, "القائمة", "Menu")}
          className="flex h-11 w-11 items-center justify-center overflow-hidden p-0 transition active:scale-95"
        >
          <Logo size={44} />
        </button>

        {/* أصغر على الجوّال: بحجمها الكامل كانت تزاحم الزرّين على جانبيها
            في شاشةٍ ضيّقة، فتبدو الترويسة مكتظّةً بلا داعٍ. */}
        <Wordmark className="select-none scale-[0.82] sm:scale-100" />

        {search ? (
          <Link href="/search" className="rq-circle" aria-label={tr(lang, "بحث", "Search")}>
            <IcSearch />
          </Link>
        ) : (
          <span className="h-11 w-11" />
        )}
      </SharedHeader>

      {/* المحتوى */}
      <main
        className="mx-auto w-full max-w-2xl flex-1 px-5 pb-28 pt-4"
        style={{ paddingBottom: `calc(${hasLive ? "11rem" : "7rem"} + env(safe-area-inset-bottom))` }}
      >
        {children}
      </main>

      {/* الشريط السفلي — التبويب النشط يرتفع بدائرة بلون الهوية.
          والحشو السفلي يقرأ المنطقة الآمنة: على آيفون كان الشريط يقع تحت
          خطّ الصفحة الرئيسية فيُقصّ نصفه، وهذا وحده يقول «صفحة» لا «تطبيق». */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 px-4 pb-4"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        {/* التذكرة تتنقّل معه: من يفتح التطبيق وهو في الطابور لم يفتحه
            ليتصفّح، بل ليطمئنّ على ترتيبه. */}
        <div className="mx-auto max-w-2xl">
          <LiveTicketBar onShow={onLiveShow} />
        </div>

        <div className="rq-nav">
          {/* تبويبان لا أكثر: المطاعم — وهو التصفّح، و«حسابي» — وفيه اسمه
              ورقمه وتذكرة دوره وحجزه وهداياه وزياراته. وكان «حسابي» خلف
              الشعار في الأعلى وحده، فلا يخطر لأحدٍ أن الشعار بابُ حساب.
              وما يُفتح كل يوم لا يُخبَّأ خلف رمز. */}
          {[
            { key: "restaurants", href: "/", icon: <IcRestaurants />, label: tr(lang, "المطاعم", "Restaurants") },
            { key: "other", href: "/me", icon: <IcAccount />, label: tr(lang, "حسابي", "My account") },
          ].map((item) => {
            const isActive = active === item.key;
            return (
              <Link key={item.key} href={item.href} className="rq-nav-item" data-active={isActive}>
                <span className={isActive ? "rq-nav-fab -mt-6" : ""}>{item.icon}</span>
                <span className={isActive ? "text-brand-800" : ""}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* الدرج الجانبي */}
      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal>
          <div className="absolute inset-0 bg-black/35" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 right-0 w-[82%] max-w-sm overflow-y-auto rounded-s-[34px] bg-[color:var(--background)] shadow-2xl">
            <div className="rq-header rounded-s-[34px] rounded-e-none px-6 pb-8 pt-5">
              <button onClick={() => setOpen(false)} className="rq-circle mb-6" aria-label={tr(lang, "إغلاق", "Close")}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
              </button>
              <div className="flex items-center justify-end gap-3">
                <span className="font-display text-xl font-bold text-[color:var(--brand-maroon)]">EIGHT</span>
                <Logo size={56} />
              </div>
            </div>
            <ul className="px-6 py-4">
              {DRAWER.map((d) => (
                <li key={d.label}>
                  <Link
                    href={d.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between border-b border-[color:var(--border)] py-4 text-[15px] font-bold text-[color:var(--ink)]"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[color:var(--muted)]"><path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    {tr(lang, d.label, d.en)}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between px-6 pb-8 pt-2">
              <span className="text-[15px] font-bold text-[color:var(--ink)]">{tr(lang, "اللغة", "Language")}</span>
              <LangToggle variant="plain" />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
