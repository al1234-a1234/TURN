"use client";

import { useState, useTransition } from "react";
import { cancelWaitlistGuest } from "./actions";
import { toAr, peopleAhead } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

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
  const lang = useLang();
  const [pending, start] = useTransition();
  const [cancelled, setCancelled] = useState(false);

  const ahead = Math.max(position - 1, 0);
  const denom = Math.max(total, position, 1);
  const progress = Math.min(Math.max((denom - ahead) / denom, 0.08), 1);

  // حلقة التقدّم
  const R = 54;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - progress);

  if (cancelled) {
    return (
      <div className="rq-card flex flex-col items-center gap-3 p-8 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[color:var(--sage)] text-3xl text-brand-700">
          ✓
        </span>
        <p className="text-lg font-extrabold text-[color:var(--ink)]">{tr(lang, "تم إلغاء دورك", "Your turn was cancelled")}</p>
        <p className="text-sm text-[color:var(--muted)]">{tr(lang, "تقدر تأخذ دورك من جديد وقت ما تحب.", "You can take a new turn whenever you like.")}</p>
      </div>
    );
  }

  return (
    <div className="rq-card flex flex-col items-center gap-5 p-8 text-center">
      {/* دائرة الرقم مع حلقة تقدّم خضراء ونبض حيّ */}
      <div className="relative flex h-44 w-44 items-center justify-center">
        <span
          className="absolute inset-4 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(150,45,20,0.20), transparent 70%)", animation: "turn-pulse 2.6s ease-out infinite" }}
        />
        <svg width="176" height="176" viewBox="0 0 128 128" className="absolute inset-0 -rotate-90">
          <defs>
            <linearGradient id="greenring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#b23c1d" />
              <stop offset="100%" stopColor="#661c0a" />
            </linearGradient>
          </defs>
          <circle cx="64" cy="64" r={R} fill="none" stroke="rgba(150,45,20,0.16)" strokeWidth="7" />
          <circle
            cx="64" cy="64" r={R} fill="none"
            stroke="url(#greenring)" strokeWidth="7" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 700ms ease" }}
          />
        </svg>
        <div className="flex flex-col items-center">
          <span className="font-display text-6xl font-bold text-brand-700 leading-none">{position ? toAr(position) : "—"}</span>
          <span className="mt-1 text-xs font-bold tracking-widest text-[color:var(--muted)]">{tr(lang, "رقم دورك", "Your turn number")}</span>
        </div>
      </div>

      <div>
        <p className="font-display text-2xl font-bold text-[color:var(--ink)]">{peopleAhead(ahead, lang)}</p>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          {ahead === 0 ? tr(lang, "استعد — جاي دورك", "Get ready — your turn is coming") : tr(lang, "راقب رقمك، وننبّهك قبل دورك", "Keep an eye on your number, we'll alert you before your turn")}
        </p>
      </div>

      {/* أهم معلومتين للعميل الواقف */}
      <div className="grid w-full grid-cols-2 gap-3">
        <div className="rounded-2xl border border-[var(--border)] bg-[color:var(--surface-2)] p-4">
          <p className="text-2xl font-extrabold text-brand-700">{ahead === 0 ? tr(lang, "التالي", "Next") : toAr(ahead)}</p>
          <p className="mt-1 text-xs text-[color:var(--muted)]">{ahead === 0 ? tr(lang, "أنت", "You") : tr(lang, "أمامك بالطابور", "Ahead of you in queue")}</p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[color:var(--surface-2)] p-4">
          <p className="text-2xl font-extrabold text-brand-700">{toAr(total)}</p>
          <p className="mt-1 text-xs text-[color:var(--muted)]">{tr(lang, "إجمالي الطابور", "Total in queue")}</p>
        </div>
      </div>

      {entryId && phone && (
        <button
          onClick={() => start(async () => { if (await cancelWaitlistGuest(entryId, phone)) setCancelled(true); })}
          disabled={pending}
          className="mt-1 h-11 w-full rounded-2xl border text-sm font-bold text-[color:var(--muted)] transition hover:text-red-600"
          style={{ borderColor: "rgba(200,70,70,0.28)" }}
        >
          {pending ? tr(lang, "جارٍ الإلغاء…", "Cancelling…") : tr(lang, "إلغاء دوري", "Cancel my turn")}
        </button>
      )}
    </div>
  );
}
