"use client";

import { useTransition } from "react";
import { setReservationStatus } from "./actions";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

export function ReservationActions({ id, status }: { id: string; status: string }) {
  const lang = useLang();
  const [pending, start] = useTransition();
  const done = status === "seated" || status === "completed" || status === "cancelled" || status === "no_show";

  if (done) {
    const label =
      status === "seated" || status === "completed"
        ? tr(lang, "تم الحضور", "Attended")
        : status === "cancelled"
          ? tr(lang, "ملغى", "Cancelled")
          : tr(lang, "لم يحضر", "No-show");
    return <span className="text-xs font-bold text-[color:var(--muted)]">{label}</span>;
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        disabled={pending}
        onClick={() => start(() => setReservationStatus(id, "seated"))}
        className="rounded-xl px-3 py-2 text-xs font-bold text-cream-100 transition disabled:opacity-60"
        style={{ background: "var(--brand-solid)" }}
      >
        {tr(lang, "إجلاس", "Seat")}
      </button>
      <button
        disabled={pending}
        onClick={() => start(() => setReservationStatus(id, "no_show"))}
        className="rounded-xl border border-[var(--hairline)] px-2.5 py-2 text-xs font-bold text-[color:var(--muted)] transition hover:text-[color:var(--st-full)] disabled:opacity-60"
      >
        {tr(lang, "لم يحضر", "No-show")}
      </button>
      <button
        disabled={pending}
        onClick={() => start(() => setReservationStatus(id, "cancelled"))}
        className="rounded-xl border border-[var(--hairline)] px-2.5 py-2 text-xs font-bold text-[color:var(--muted)] transition hover:text-[color:var(--danger)] disabled:opacity-60"
      >
        {tr(lang, "إلغاء", "Cancel")}
      </button>
    </div>
  );
}
