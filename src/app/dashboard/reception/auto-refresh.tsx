"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * تحديث ذكي للوحة الاستقبال — حاسم للسعة عند ١٠٠٠ مطعم:
 * كان router.refresh() يعيد ريندر SSR كاملًا (عدة استعلامات) كل ١٠ثوانٍ لكل
 * فرع (٨٦٤ ريندر/فرع/يوم). الآن نستطلع نبضة queue_version الخفيفة المفهرسة،
 * ولا نعيد الريندر إلا عند تغيّر فعلي في الطابور — خفض الحمل ~٩٠٪.
 * نفس ضمانات التذكرة: إيقاف عند الخمول، تنظيف كامل، تباعد عند الفشل.
 */
export function AutoRefresh({
  branchId,
  intervalMs = 10_000,
  initialVersion = null,
}: {
  branchId: string;
  intervalMs?: number;
  /**
   * بصمة الطابور لحظةَ التصيير على الخادم.
   *
   * ── العطب الذي تُصلحه ──
   * كان خطّ الأساس يُبنى من **أوّل نبضة في المتصفّح** لا ممّا رُسم فعلًا:
   * `if (lastVersion !== null && …)` تعني أنّ النبضة الأولى تسجّل وتصمت.
   * فتغييرٌ يقع بين التصيير والنبضة الأولى يُدفن في خطّ الأساس **ولا يظهر
   * أبدًا** حتى يقع تغييرٌ آخر — وقد لا يقع في فرعٍ هادئ.
   *
   * وهذا يفسّر تفاوت المثبَّت عن المتصفّح: التبويب يُطرد فيعيد التصيير
   * ويهرب من العطب، أمّا المثبَّت فيبقى حيًّا أيّامًا عالقًا فيه.
   *
   * الآن يبدأ المستطلِع من نسخة الخادم، فأوّل نبضة تكشف أيّ فارق.
   */
  initialVersion?: string | null;
}) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let fails = 0;
    let lastVersion: string | null = initialVersion;
    const supabase = createClient();

    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
    const schedule = (ms: number) => { clear(); timer = setTimeout(tick, ms); };

    const tick = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const { data, error } = await supabase.rpc("queue_version", { p_branch_id: branchId });
        if (error) throw error;
        const v = String(data ?? "");
        if (lastVersion !== null && v !== lastVersion) router.refresh();
        lastVersion = v;
        fails = 0;
        schedule(intervalMs);
      } catch {
        fails = Math.min(fails + 1, 4);
        schedule(Math.min(intervalMs * 2 ** fails, 60_000));
      }
    };

    const onVis = () => {
      if (typeof document === "undefined") return;
      if (document.hidden) clear();
      else {
        // عودة من الخمول → مزامنة فوريّة. ولا نُصفّر خطّ الأساس: تصفيره يُعيد
        // العطب نفسه (النبضة التالية تسجّل وتصمت). نستطلع فورًا بدل الانتظار.
        router.refresh();
        schedule(0);
      }
    };

    document.addEventListener("visibilitychange", onVis);
    if (!document.hidden) schedule(intervalMs);

    return () => {
      clear();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [router, branchId, intervalMs, initialVersion]);

  return null;
}
