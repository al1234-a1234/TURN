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
export function AutoRefresh({ branchId, intervalMs = 10_000 }: { branchId: string; intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let fails = 0;
    let lastVersion: string | null = null;
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
      else { lastVersion = null; router.refresh(); schedule(intervalMs); } // عودة من الخمول → مزامنة فورية
    };

    document.addEventListener("visibilitychange", onVis);
    if (!document.hidden) schedule(intervalMs);

    return () => {
      clear();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [router, branchId, intervalMs]);

  return null;
}
