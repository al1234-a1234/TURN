"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** نقطة إشعار: عدد الهدايا النشطة غير المقروءة على رقم العميل المحفوظ. */
export function RewardsBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const phone = typeof window !== "undefined" ? window.localStorage.getItem("turn:phone") : null;
    if (!phone) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.rpc("get_customer_rewards", { p_phone: phone });
        let seen: string[] = [];
        try { seen = JSON.parse(window.localStorage.getItem("turn:seen_rewards") || "[]"); } catch { seen = []; }
        const n = ((data ?? []) as { id: string; status: string }[]).filter(
          (r) => r.status === "active" && !seen.includes(r.id),
        ).length;
        if (!cancelled) setCount(n);
      } catch { /* تجاهل */ }
    })();
    return () => { cancelled = true; };
  }, []);

  if (count <= 0) return null;
  return (
    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[color:var(--st-open)] px-1.5 text-[11px] font-extrabold text-white">
      {count}
    </span>
  );
}
