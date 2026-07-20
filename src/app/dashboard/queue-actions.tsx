"use client";

import { useTransition } from "react";
import { updateWaitlistStatus } from "./waitlist-actions";

export function QueueActions({ id }: { id: string }) {
  const [pending, start] = useTransition();

  return (
    <div className="flex shrink-0 gap-2">
      <button
        disabled={pending}
        onClick={() => start(() => updateWaitlistStatus(id, "seated"))}
        className="rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-700 disabled:opacity-60"
      >
        جلوس
      </button>
      <button
        disabled={pending}
        onClick={() => start(() => updateWaitlistStatus(id, "cancelled"))}
        className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-bold text-[color:var(--muted)] transition hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
      >
        إزالة
      </button>
    </div>
  );
}
