"use client";

import { useState, useTransition } from "react";
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
          await setStaffPermission(staffId, perm, next);
        })
      }
      className="flex items-center justify-between gap-2 rounded-2xl border p-3 text-start transition disabled:opacity-60"
      style={{ borderColor: "var(--border)", background: on ? "var(--sage)" : "var(--surface)" }}
    >
      <span className="text-sm font-bold" style={{ color: on ? "var(--brand-d)" : "var(--muted)" }}>{label}</span>
      <span className="relative h-6 w-11 shrink-0 rounded-full transition" style={{ background: on ? "linear-gradient(160deg,#a8371a,#661c0a)" : "var(--surface-2)", border: "1px solid var(--border)" }}>
        <span className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow transition-all" style={{ insetInlineStart: on ? "1.45rem" : "0.2rem" }} />
      </span>
    </button>
  );
}
