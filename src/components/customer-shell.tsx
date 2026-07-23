"use client";

import Link from "next/link";
import { useState } from "react";
import { BrandMark } from "@/components/brand";
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
function IcPeople() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="8.5" cy="8" r="3" />
      <circle cx="16" cy="9.5" r="2.4" />
      <path d="M2.5 19c0-3 2.7-5 6-5s6 2 6 5v.5h-12V19z" />
      <path d="M15 14.4c2.7.2 4.5 2 4.5 4.6v.5H17" />
    </svg>
  );
}
function IcMenuBars() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 7h14M5 12h14M5 17h9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
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
function IcList() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M8 7h11M8 12h11M8 17h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="4" cy="7" r="1.2" fill="currentColor" /><circle cx="4" cy="12" r="1.2" fill="currentColor" /><circle cx="4" cy="17" r="1.2" fill="currentColor" />
    </svg>
  );
}
function IcDiary() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="4" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

const DRAWER = [
  { label: "الاشتراكات", en: "Subscriptions", href: "/me/waitlist" },
  { label: "المفضلة", en: "Favorites", href: "/me/favorites" },
  { label: "الإعدادات", en: "Settings", href: "/me" },
  { label: "من نحن", en: "About Us", href: "/about" },
  { label: "تواصل معنا", en: "Contact Us", href: "/contact" },
];

export function CustomerShell({
  title,
  active = "restaurants",
  search = true,
  children,
}: {
  title: string;
  active?: "restaurants" | "other" | "diaries";
  search?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const lang = useLang();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* الهيدر — يمين: الشعار (يفتح القائمة) · يسار: بحث */}
      <header className="rq-header px-5 pb-5 pt-5">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <button
            onClick={() => setOpen(true)}
            aria-label={tr(lang, "القائمة", "Menu")}
            className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-white/15 ring-1 ring-white/25 transition active:scale-95"
          >
            <BrandMark size={30} />
          </button>
          {search && (
            <Link href="/search" className="rq-circle" aria-label={tr(lang, "بحث", "Search")}>
              <IcSearch />
            </Link>
          )}
        </div>
      </header>

      {/* المحتوى */}
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-28 pt-4">{children}</main>

      {/* الشريط السفلي */}
      <nav className="fixed inset-x-0 bottom-0 z-30 px-4 pb-4">
        <div className="rq-nav">
          <Link href="/diaries" className="rq-nav-item" data-active={active === "diaries"}>
            <IcDiary />
            {tr(lang, "اليوميات", "Diaries")}
          </Link>
          <Link href="/me" className="rq-nav-item" data-active={active === "other"}>
            <IcList />
            {tr(lang, "أخرى", "Other")}
          </Link>
          <Link href="/" className="rq-nav-item" data-active={active === "restaurants"}>
            <span className={active === "restaurants" ? "rq-nav-fab -mt-6" : ""}>
              <IcRestaurants />
            </span>
            <span className={active === "restaurants" ? "text-brand-800" : ""}>{tr(lang, "المطاعم", "Restaurants")}</span>
          </Link>
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
                <span className="font-display text-xl font-bold">{tr(lang, "دور", "Turn")}</span>
                <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white/15 ring-1 ring-white/25">
                  <BrandMark size={40} />
                </span>
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
