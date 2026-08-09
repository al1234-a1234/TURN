"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Logo, Wordmark } from "@/components/logo";
import { LangToggle } from "@/components/lang-toggle";
import { LogoutButton } from "@/components/logout-button";
import { useLang } from "@/components/lang-provider";
import { tr } from "@/lib/i18n";
import { toAr } from "@/lib/format";
import type { NavItem } from "./owner-nav";

/**
 * ترويسة المالك — نفس هوية العميل، والتنقّل خلف الشعار.
 *
 * كانت تخالف الهوية في ثلاثة أشياء دفعةً واحدة:
 *
 *  ١) اللون: عنابيّ مُشبَع (`app-header`) بينما ترويسة العميل كريميّة
 *     (`rq-header`). فمن يفتح التطبيقين يظنّهما تطبيقين. صارت كريميّة.
 *  ٢) الشعار: لوح «8» وحده في الزاوية بلا كلمة `EIGHT` المتوسّطة — بينما
 *     هوية العلامة هي الاثنان معًا. صار نفس ترتيب العميل حرفيًّا.
 *  ٣) الصفّ: «تسجيل الخروج» كلمةً كاملة في كبسولة، فتصير أعرض شيءٍ في
 *     الترويسة وأكثرها لفتًا — وهي آخر ما يفعله المالك في يومه. نزلت إلى
 *     الدرج مع بقيّة الأدوات.
 *
 * والتبويبات الأفقية أُزيلت: أحد عشر تبويبًا في شريطٍ ينزلق أفقيًّا يعني أن
 * نصفها لا يُرى أبدًا، وأن كل صفحةٍ تبدأ بجدارٍ من الخيارات. الشعار يفتحها
 * كما يفتحها العميل تمامًا.
 *
 * وعوضًا عن التبويبات صار العنوان يقول اسم الشاشة: بلا شريطٍ يُبرز النشط،
 * كان المالك سيفقد إحساسه بموضعه.
 */
export function OwnerHeader({
  items,
  counts,
  restaurantName,
  restaurantSlug,
  branchLabel,
}: {
  items: NavItem[];
  counts?: Record<string, number>;
  restaurantName: string;
  restaurantSlug: string;
  /** «فرع كذا» أو «لوحة المطعم» — يُحسب على الخادم لأنه يتبع اللغة */
  branchLabel: string;
}) {
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  // اسم الشاشة الحالية — أدقّ تطابقٍ يفوز («/dashboard/reception» قبل «/dashboard»)
  const current =
    [...items].sort((a, b) => b.href.length - a.href.length).find((n) => isActive(n.href)) ?? items[0];

  return (
    <>
      {/* نفس صنف ترويسة العميل: اللون والانحناء والظلّ من مصدرٍ واحد */}
      <header className="rq-header relative px-5 pb-6 pt-5 lg:hidden">
        <div className="relative mx-auto flex max-w-3xl items-center justify-between">
          <button
            onClick={() => setOpen(true)}
            aria-label={tr(lang, "القائمة", "Menu")}
            className="flex items-center justify-center transition active:scale-95"
          >
            <Logo size={44} />
          </button>

          <Wordmark className="select-none" />

          <Link
            href={`/r/${restaurantSlug}`}
            className="rq-circle"
            aria-label={tr(lang, "الصفحة العامة", "Public page")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M14 3h7v7M21 3l-9 9M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>

        <div className="mx-auto mt-5 max-w-3xl">
          <p className="truncate text-[12.5px] font-bold" style={{ color: "rgba(120,30,12,0.62)" }}>
            {restaurantName} · {branchLabel}
          </p>
          <h1 className="mt-0.5 truncate font-display text-[26px] font-bold" style={{ color: "var(--brand-maroon)" }}>
            {current?.label ?? restaurantName}
          </h1>
        </div>
      </header>

      {/* ===== الدرج — نفس درج العميل شكلًا وسلوكًا ===== */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal>
          <div className="absolute inset-0 bg-black/35" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 right-0 flex w-[82%] max-w-sm flex-col overflow-y-auto rounded-s-[34px] bg-[color:var(--background)] shadow-2xl">
            <div className="rq-header rounded-s-[34px] rounded-e-none px-6 pb-7 pt-5">
              <button onClick={() => setOpen(false)} className="rq-circle mb-6" aria-label={tr(lang, "إغلاق", "Close")}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
              </button>
              <div className="flex items-center justify-end gap-3">
                <span className="font-display text-xl font-bold text-[color:var(--brand-maroon)]">EIGHT</span>
                <Logo size={56} />
              </div>
              <p className="mt-3 truncate text-end text-[13px] font-bold" style={{ color: "rgba(120,30,12,0.62)" }}>
                {restaurantName} · {branchLabel}
              </p>
            </div>

            <ul className="flex-1 px-6 py-3">
              {items.map((n) => {
                const on = isActive(n.href);
                const c = counts?.[n.key];
                return (
                  <li key={n.key}>
                    <Link
                      href={n.href}
                      prefetch
                      onClick={() => setOpen(false)}
                      className="flex items-center justify-between gap-3 border-b py-3.5 text-[15px] font-bold"
                      style={{ borderColor: "var(--border)", color: on ? "var(--brand-d)" : "var(--ink)" }}
                    >
                      <span className="flex items-center gap-2">
                        {c != null && c > 0 && (
                          <span
                            className="rounded-full px-2 py-0.5 text-[11px] font-extrabold tabular-nums"
                            style={{ background: "var(--sage)", color: "var(--brand-d)" }}
                          >
                            {toAr(c)}
                          </span>
                        )}
                        {/* الشاشة الحالية تُعلَّم بنقطةٍ لا بخلفيّةٍ مُشبَعة:
                            الدرج قائمةُ وجهات، وتلوين أحدها كاملًا يجعله زرًّا */}
                        {on ? (
                          <span className="h-2 w-2 rounded-full" style={{ background: "var(--brand-solid)" }} />
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[color:var(--muted)]"><path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        )}
                      </span>
                      <span className="truncate">{n.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className="px-6 pb-8 pt-2">
              <Link
                href="/account"
                onClick={() => setOpen(false)}
                className="flex items-center justify-end border-b py-3.5 text-[15px] font-bold text-[color:var(--ink)]"
                style={{ borderColor: "var(--border)" }}
              >
                {tr(lang, "حسابي — تغيير كلمة المرور", "My account — change password")}
              </Link>
              <div className="flex items-center justify-between py-4">
                <LangToggle variant="plain" />
                <span className="text-[15px] font-bold text-[color:var(--ink)]">{tr(lang, "اللغة", "Language")}</span>
              </div>
              <LogoutButton variant="plain" />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
