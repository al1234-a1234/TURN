"use client";

import { SmartImage } from "@/components/smart-image";
import { readPeek, type Peek } from "@/lib/peek";
import { useEffect, useState } from "react";
import { toAr } from "@/lib/format";
import { useLang } from "@/components/lang-provider";
import { tr } from "@/lib/i18n";

/**
 * بطل «اللمحة» داخل هيكل تحميل صفحة المطعم: يقرأ ما خزّنته بطاقة الرئيسية
 * لحظة الضغط، فيرى العميل اسم المطعم وشعاره وعدد طابوره «فورًا» — لا
 * صناديق رمادية — ريثما يحلّ محلّه جواب الخادم الحيّ.
 *
 * لا يعرف الهيكلُ مَعْلماته، فالرابط يُقرأ من مسار المتصفّح. وإن غابت
 * اللمحة (فتح مباشر برابط، أول زيارة) يسقط للهيكل الرمادي المعهود.
 */
export function PeekHero() {
  const lang = useLang();
  const [peek, setPeek] = useState<Peek | null>(null);

  useEffect(() => {
    const m = /\/r\/([^/?#]+)/.exec(window.location.pathname);
    if (m) setPeek(readPeek(decodeURIComponent(m[1])));
  }, []);

  const bar = "animate-pulse rounded-2xl";
  const initial = (peek?.name ?? "").trim().charAt(0);

  return (
    <div className="flex flex-col items-center">
      <span className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-brand-800 font-serif text-2xl font-bold text-cream-100 shadow-lg">
        {peek?.logo ? (
          <SmartImage src={peek.logo} fallbackText={peek.name} alt="" width={80} height={80} sizes="80px" className="h-full w-full object-cover" />
        ) : peek ? (
          initial
        ) : (
          <span className={`${bar} h-full w-full`} style={{ background: "rgba(120,30,12,0.10)" }} />
        )}
      </span>
      {peek ? (
        <>
          <p className="mt-3 font-display text-xl font-extrabold text-[color:var(--ink)]">{peek.name}</p>
          <p className="mt-1 text-[13px] font-bold text-[color:var(--muted)]">
            {peek.closed
              ? tr(lang, "مغلق حاليًا", "Closed now")
              : typeof peek.waiting === "number"
                ? peek.waiting > 0
                  ? tr(lang, `${toAr(peek.waiting)} بالطابور الآن…`, `${toAr(peek.waiting)} in queue…`)
                  : tr(lang, "متاح الآن · بدون انتظار", "Available now · no wait")
                : "…"}
          </p>
        </>
      ) : (
        <span className={`${bar} mt-3 h-6 w-40`} style={{ background: "var(--surface-2)" }} />
      )}
    </div>
  );
}
