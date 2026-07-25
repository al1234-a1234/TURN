"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * تحديث تلقائي للوحة الاستقبال بلا Realtime وبلا إعادة تحميل كامل.
 * يستدعي router.refresh() (تحديث ناعم للـServer Component، ليس revalidatePath)
 * كل intervalMs، ويتوقف عند خمول التبويب ويستأنف عند العودة، مع تنظيف كامل.
 */
export function AutoRefresh({ intervalMs = 10_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let fails = 0;
    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
    const schedule = (ms: number) => { clear(); timer = setTimeout(tick, ms); };

    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        router.refresh();
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
      else schedule(intervalMs);
    };

    document.addEventListener("visibilitychange", onVis);
    if (!document.hidden) schedule(intervalMs);

    return () => {
      clear();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [router, intervalMs]);

  return null;
}
