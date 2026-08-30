"use client";

import { useState, useTransition } from "react";
import { SwitchTrack } from "@/components/toggle-switch";
import { setStaffPermission } from "./actions";
import type { StaffPermission } from "@/lib/features";

export function PermToggle({
  staffId,
  perm,
  label,
  granted,
}: {
  staffId: string;
  perm: StaffPermission;
  label: string;
  granted: boolean;
}) {
  const [on, setOn] = useState(granted);
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const next = !on;
          setOn(next);
          const ok = await setStaffPermission(staffId, perm, next);
          if (!ok) setOn(!next); // فشل الخادم → نتراجع بدل مفتاحٍ يكذب
        })
      }
      className="flex items-center justify-between gap-2 rounded-2xl border p-3 text-start transition disabled:opacity-60"
      style={{ borderColor: "var(--border)", background: on ? "var(--sage)" : "var(--surface)" }}
    >
      <span className="text-sm font-bold" style={{ color: on ? "var(--brand-d)" : "var(--muted)" }}>{label}</span>
      <SwitchTrack on={on} />
    </button>
  );
}
