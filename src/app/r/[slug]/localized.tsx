"use client";

/**
 * القطع المترجَمة في صفحة المطعم — أُخرجت من الخادم إلى المتصفّح.
 *
 * السبب أداءٌ لا ترتيب: قراءة كوكي اللغة على الخادم (`getLang()`) تجعل
 * الصفحة ديناميكية، فكل مسحةِ باركود تسافر إلى فرانكفورت قبل أن يرى
 * العميل شيئًا. واللغة موجودة في المتصفّح أصلًا عبر `useLang()` — وهكذا
 * تعمل بطاقة الرئيسية منذ البداية.
 */

import Link from "next/link";
import { useLang } from "@/components/lang-provider";
import { tr } from "@/lib/i18n";
import { safeExternalUrl } from "@/lib/format";
import { Logo } from "@/components/logo";

/** نصٌّ ثنائي اللغة يختار في المتصفّح */
export function T({ ar, en }: { ar: string; en: string }) {
  return <>{tr(useLang(), ar, en)}</>;
}

export function HomeLink() {
  const lang = useLang();
  return (
    <Link
      href="/"
      aria-label={tr(lang, "الصفحة الرئيسية", "Home")}
      className="flex items-center justify-center transition active:scale-95"
    >
      <Logo size={44} />
    </Link>
  );
}

export function BackLink() {
  const lang = useLang();
  return (
    <Link href="/" className="rq-circle" aria-label={tr(lang, "رجوع", "Back")}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </Link>
  );
}

export function NoBranchesCard() {
  const lang = useLang();
  return (
    <div className="rq-card p-10 text-center text-[color:var(--muted)]">
      <span className="text-4xl">🏝️</span>
      <p className="mt-3 text-sm">{tr(lang, "لا توجد فروع متاحة حاليًا.", "No branches available right now.")}</p>
    </div>
  );
}

const LINK_KEYS: { key: string; wa?: boolean }[] = [
  { key: "maps" },
  { key: "instagram" },
  { key: "x" },
  { key: "tiktok" },
  { key: "snapchat" },
  { key: "whatsapp", wa: true },
  { key: "website" },
];

/** أيقونات المنصّات — أشكال معروفة بهويتنا (أبيض على تدرّج برتقالي). */
function LinkGlyph({ k }: { k: string }) {
  const p = { fill: "none", stroke: "var(--brand-ink)", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (k) {
    case "instagram":
      return <svg width="21" height="21" viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="5" {...p} /><circle cx="12" cy="12" r="4" {...p} /><circle cx="17.2" cy="6.8" r="1.1" fill="var(--brand-ink)" stroke="none" /></svg>;
    case "maps":
      return <svg width="21" height="21" viewBox="0 0 24 24"><path d="M12 21s6.5-6.4 6.5-11A6.5 6.5 0 0 0 5.5 10c0 4.6 6.5 11 6.5 11z" {...p} /><circle cx="12" cy="10" r="2.4" {...p} /></svg>;
    case "x":
      return <svg width="19" height="19" viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19" {...p} /></svg>;
    case "tiktok":
      return <svg width="20" height="20" viewBox="0 0 24 24"><path d="M14 4v9.5a3.2 3.2 0 1 1-2.4-3.1" {...p} /><path d="M14 4c.4 2.2 1.9 3.6 4 3.8" {...p} /></svg>;
    case "snapchat":
      return <svg width="21" height="21" viewBox="0 0 24 24"><path d="M12 4c2.6 0 3.7 2 3.7 4.4 0 1 .1 1.8.5 2.3M12 4c-2.6 0-3.7 2-3.7 4.4 0 1.6-.1 2.2-.7 2.6M12 4v0" {...p} /><path d="M8 10.6c-1 .6-2 .7-2.4.9-.6.3-.3.9.2 1.2.7.4 1.6.4 1.8 1 .3.9-1.7 2-3 2.3 1 1.2 2.4 1.8 3.6 1.8M16 10.6c1 .6 2 .7 2.4.9.6.3.3.9-.2 1.2-.7.4-1.6.4-1.8 1-.3.9 1.7 2 3 2.3-1 1.2-2.4 1.8-3.6 1.8" {...p} /></svg>;
    case "whatsapp":
      return <svg width="21" height="21" viewBox="0 0 24 24"><path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.6-4A8 8 0 1 1 20 11.5z" {...p} /><path d="M9 9.2c.2-.6.4-.6.7-.6h.5c.2 0 .4.3.5.6l.5 1.2c0 .2 0 .3-.1.4l-.4.5c-.1.1-.2.3 0 .5.5.9 1.3 1.5 2.2 1.9.2.1.4 0 .5-.1l.4-.5c.1-.1.3-.2.5-.1l1.2.6c.2.1.3.2.3.4 0 .6-.4 1.2-1 1.4-.5.2-1.1.2-2.6-.5a7 7 0 0 1-3-3c-.6-1.3-.6-1.9-.7-2.6z" fill="var(--brand-ink)" stroke="none" /></svg>;
    default: // website
      return <svg width="21" height="21" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.3" {...p} /><path d="M3.7 12h16.6M12 3.7c2.6 2.4 2.6 14.2 0 16.6M12 3.7c-2.6 2.4-2.6 14.2 0 16.6" {...p} /></svg>;
  }
}

export function RestaurantLinks({ links }: { links: Record<string, string> }) {
  const lang = useLang();
  // كل رابط يُمرَّر على حارس البروتوكول قبل أن يصل href — ما لا يصلح يُسقَط
  // من القائمة أصلًا فلا يُعرض زرٌّ ميّت. الفحص القديم (startsWith("http"))
  // كان يمرّر http:// غير المشفّر، ولم يكن ليمنع بروتوكولًا خبيثًا لولا أنه
  // يلصق https:// أمامه مصادفةً.
  const present = LINK_KEYS
    .map((m) => ({ ...m, href: safeExternalUrl(links[m.key]) }))
    .filter((m): m is typeof m & { href: string } => m.href !== null);
  if (present.length === 0) return null;
  return (
    <div className="mt-6 rq-card p-5 text-center">
      <p className="mb-4 font-display text-base font-bold text-[color:var(--ink)]">{tr(lang, "تابعنا وزورنا", "Follow & visit us")}</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {present.map((m) => {
          const raw = links[m.key].trim();
          const href = m.wa
            ? raw.startsWith("http") ? raw : `https://wa.me/${raw.replace(/\D/g, "")}`
            : raw.startsWith("http") ? raw : `https://${raw}`;
          return (
            <a
              key={m.key}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-12 w-12 items-center justify-center rounded-full transition active:scale-95"
              style={{ background: "var(--brand-solid)", boxShadow: "0 8px 18px -10px rgba(102,28,10,0.7)" }}
            >
              <LinkGlyph k={m.key} />
            </a>
          );
        })}
      </div>
    </div>
  );
}
