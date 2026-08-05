"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** نقطة إشعار: عدد الهدايا الصالحة على رقم الجهاز المحفوظ. */
export function RewardsBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const phone = window.localStorage.getItem("turn:phone");
        if (!phone || !/^05\d{8}$/.test(phone)) return;
        const { data } = await supabase.rpc("rewards_by_phone", { p_phone: phone });
        const n = ((data ?? []) as { status: string }[]).filter((r) => r.status === "active").length;
        if (!cancelled) setCount(n);
      } catch { /* تجاهل */ }
    })();
    return () => { cancelled = true; };
  }, []);

  if (count <= 0) return null;
  return (
    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[color:var(--brand-d)] px-1.5 text-[11px] font-extrabold text-cream-100">
      {count}
    </span>
  );
}
