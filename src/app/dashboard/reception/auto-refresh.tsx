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
 *
 * ── ولماذا أُضيف Realtime فوق الاستطلاع لا بدلًا منه ──
 * الاستطلاع يقيس الزمن، لا الحدث: أسرعُ ما يراه المضيفُ تغييرًا هو طولُ
 * الفترة. وRealtime يدفع التغيير لحظةَ وقوعه. لكنّه قناةٌ قد تسقط بصمت
 * (شبكةُ مقهًى، وكيلٌ يقطع WebSocket، جدارٌ ناريّ في المطعم) — والسقوط
 * الصامت هو بالضبط ما نطارده. فالاستطلاع يبقى شبكةَ أمانٍ لا يُلغى.
 */
export function AutoRefresh({
  branchId,
  intervalMs = 10_000,
  liveIntervalMs = 30_000,
  initialVersion = null,
}: {
  branchId: string;
  /**
   * فترة الاستطلاع **حين لا يعمل Realtime** — وهي الفترة التي نبدأ بها دائمًا.
   */
  intervalMs?: number;
  /**
   * الفترة بعد أن يؤكّد الخادم الاشتراك (`SUBSCRIBED`) — الشبكة الاحتياطيّة.
   *
   * ── ولماذا لا نبدأ بها ──
   * لو بدأنا مسترخين ثمّ لم يعمل Realtime (الجدولُ غير منشورٍ بعد، أو
   * WebSocket محجوب) لصار الاستقبال **أبطأ ممّا كان**: ٣٠ث بدل ٤ث. فالتراخي
   * لا يقع إلا بعد دليلٍ من الخادم أنّ القناة حيّة، ويُلغى فور سقوطها.
   * وبهذا لا يتعلّق نشرُ هذه الشيفرة بتوقيت تطبيق الترحيل إطلاقًا.
   */
  liveIntervalMs?: number;
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
    let burst: ReturnType<typeof setTimeout> | null = null;
    let fails = 0;
    let lastVersion: string | null = initialVersion;
    /** الفترة السارية الآن: تسترخي عند تأكيد القناة، وتعود عند سقوطها. */
    let period = intervalMs;
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
        schedule(period);
      } catch {
        fails = Math.min(fails + 1, 4);
        schedule(Math.min(period * 2 ** fails, 60_000));
      }
    };

    /**
     * دفعةٌ واحدة من التغييرات = ريندرٌ واحد.
     * إجلاسُ عميلٍ في طابورٍ من ثلاثين يحرّك صفَّه وصفوفَ من خلفه، فتصل
     * عشرات أحداث UPDATE في أجزاء من الثانية. بلا تجميعٍ لصارت كلُّ واحدةٍ
     * ريندرَ SSR كاملًا — والعلاج يصير أثقل من الداء.
     */
    const onChange = () => {
      if (burst) clearTimeout(burst);
      burst = setTimeout(() => {
        burst = null;
        if (typeof document !== "undefined" && document.hidden) return;
        router.refresh();
        // ولا نلمس `lastVersion` هنا عمدًا: قراءتها بعد `router.refresh()`
        // سباقٌ مع تصييرٍ لم يكتمل، وقد تبتلع تغييرًا وقع بينهما — وهو العطب
        // نفسه الذي أصلحناه أمس. فالنبضة التالية تُصحّح الأساس، وثمنُها
        // ريندرٌ زائدٌ واحدٌ على الأكثر في الدورة. الأمان أرخص من التكرار.
      }, 300);
    };

    const channel = supabase
      .channel(`reception-queue:${branchId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "waitlist_entries",
          filter: `branch_id=eq.${branchId}`,
        },
        onChange,
      )
      .subscribe((status) => {
        // الاسترخاء بدليلٍ من الخادم لا بالأمل. وأيّ حالةٍ غير `SUBSCRIBED`
        // (خطأ، انقطاع، مهلة، إغلاق) تعيدنا إلى الفترة السريعة فورًا.
        const live = status === "SUBSCRIBED";
        const next = live ? liveIntervalMs : intervalMs;
        if (next === period) return;
        period = next;
        if (typeof document !== "undefined" && !document.hidden) schedule(live ? period : 0);
      });

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
    if (!document.hidden) schedule(period);

    return () => {
      clear();
      if (burst) { clearTimeout(burst); burst = null; }
      document.removeEventListener("visibilitychange", onVis);
      void supabase.removeChannel(channel);
    };
  }, [router, branchId, intervalMs, liveIntervalMs, initialVersion]);

  return null;
}
