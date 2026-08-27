"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * تحديثٌ ذاتي لصفحةٍ أرقامها حيّة — الرئيسية أولًا.
 *
 * ثلاث لحظات كانت تعرض فيها الرئيسية أرقامًا ميّتة:
 *   ١) الرجوع بزرّ «خلف» في سفاري: ذاكرة الصفحات (bfcache) تعيد الصفحة
 *      بحالتها القديمة كاملةً بلا أي طلب شبكة — «فيه طابور ١» بعد أن أُلغي.
 *   ٢) عودة التبويب للواجهة بعد غياب.
 *   ٣) البقاء على الصفحة والطابور يتحرّك خلفها.
 *
 * ‏router.refresh() يعيد جلب مكوّنات الخادم فقط — لا يمسّ حالة العميل ولا
 * يومض. وكلفته مقصوصة بكاش الخادم (عدّادات ١٠ث، اكتشاف ٣٠ث): الضغط على
 * القاعدة لا يتغيّر مهما كثر المنعشون.
 */
export function AutoRefresh({ everyMs = 25_000 }: { everyMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) router.refresh(); };
    const onVisible = () => { if (!document.hidden) router.refresh(); };
    const timer = setInterval(() => { if (!document.hidden) router.refresh(); }, everyMs);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, everyMs]);

  return null;
}
