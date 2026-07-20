"use client";

import { useState, useTransition } from "react";
import { cancelWaitlistGuest } from "./actions";

const MIN_PER_PARTY = 7; // تقدير تقريبي للوقت لكل مجموعة أمامك

export function QueueTicket({
  position,
  total,
  entryId,
  phone,
}: {
  position: number;
  total: number;
  entryId?: string;
  phone?: string;
}) {
  const [pending, start] = useTransition();
  const [cancelled, setCancelled] = useState(false);

  const ahead = Math.max(position - 1, 0);
  const eta = ahead * MIN_PER_PARTY;
  const denom = Math.max(total, position, 1);
  const progress = Math.min(Math.max((denom - ahead) / denom, 0.08), 1);

  // حلقة التقدّم
  const R = 54;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - progress);

  if (cancelled) {
    return (
      <div className="soft-card flex flex-col items-center gap-3 p-8 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[color:var(--surface-2)] text-3xl">
          ✓
        </span>
        <p className="text-lg font-extrabold text-[color:var(--foreground)]">تم إلغاء دورك</p>
        <p className="text-sm text-[color:var(--muted)]">تقدر تأخذ دورك من جديد وقت ما تحب.</p>
      </div>
    );
  }

  return (
    <div className="soft-card flex flex-col items-center gap-5 p-8 text-center">
      {/* دائرة الرقم مع حلقة تقدّم ونبض حيّ */}
      <div className="relative flex h-40 w-40 items-center justify-center">
        <span className="absolute inset-3 rounded-full bg-[color:var(--cream)]/20" style={{ animation: "turn-pulse 2.4s ease-out infinite" }} />
        <svg width="160" height="160" viewBox="0 0 128 128" className="absolute inset-0 -rotate-90">
          <circle cx="64" cy="64" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="8" />
          <circle
            cx="64" cy="64" r={R} fill="none"
            stroke="var(--cream)" strokeWidth="8" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 600ms ease" }}
          />
        </svg>
        <div className="flex flex-col items-center">
          <span className="text-5xl font-extrabold text-[color:var(--cream)]">{position || "—"}</span>
          <span className="text-xs font-bold text-[color:var(--muted)]">رقم دورك</span>
        </div>
      </div>

      <p className="text-xl font-extrabold text-[color:var(--foreground)]">أنت في الطابور</p>

      {/* أهم معلومتين للعميل الواقف */}
      <div className="grid w-full grid-cols-2 gap-3">
        <div className="rounded-2xl bg-[color:var(--surface-2)] p-4">
          <p className="text-2xl font-extrabold text-[color:var(--foreground)]">
            {ahead === 0 ? "أنت التالي" : ahead}
          </p>
          <p className="mt-1 text-xs text-[color:var(--muted)]">{ahead === 0 ? "استعد" : "أمامك (أشخاص)"}</p>
        </div>
        <div className="rounded-2xl bg-[color:var(--surface-2)] p-4">
          <p className="text-2xl font-extrabold text-[color:var(--foreground)]">
            {eta === 0 ? "~الآن" : `~${eta}`}
          </p>
          <p className="mt-1 text-xs text-[color:var(--muted)]">الوقت التقديري (دقيقة)</p>
        </div>
      </div>

      {entryId && phone && (
        <button
          onClick={() => start(async () => { if (await cancelWaitlistGuest(entryId, phone)) setCancelled(true); })}
          disabled={pending}
          className="mt-1 h-11 w-full rounded-2xl border text-sm font-bold text-[color:var(--muted)] transition hover:text-red-300"
          style={{ borderColor: "rgba(220,90,90,0.35)", background: "var(--surface)" }}
        >
          {pending ? "جارٍ الإلغاء…" : "إلغاء دوري"}
        </button>
      )}
    </div>
  );
}
