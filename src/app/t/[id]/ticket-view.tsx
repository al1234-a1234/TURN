"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { IconHourglass, IconSparkle } from "@/components/icons";
import { confirmAttendance, cancelByTicket } from "./actions";
import { createClient } from "@/lib/supabase/client";
import { toAr, peopleAhead } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

const TERMINAL = new Set(["seated", "cancelled", "expired", "no_show"]);

function intervalFor(ahead: number): number {
  if (ahead <= 2) return 10_000;
  if (ahead <= 9) return 30_000;
  return 60_000;
}

type Row = {
  status: string;
  position: number;
  ahead: number;
  total: number;
  confirmed: boolean;
  restaurant: string;
  slug: string;
};

/** تذكرة العميل من رابط واتساب — بلا بيانات شخصية، وفيها زر «أكّد حضوري». */
export function TicketView({ entryId, initial }: { entryId: string; initial: Row }) {
  const lang = useLang();
  const [row, setRow] = useState<Row>(initial);
  const [askCancel, setAskCancel] = useState(false);
  const [pending, start] = useTransition();

  const poll = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("waitlist_ticket_by_id", { p_entry_id: entryId });
    if (error) return null;
    const r = (Array.isArray(data) ? data[0] : data) as Row | undefined;
    if (r) setRow(r);
    return r ?? null;
  }, [entryId]);

  // استطلاع متكيّف (نفس نهج التذكرة الأصلية): يتوقّف عند الخمول وعند الحالة النهائية
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
    const tick = async () => {
      if (stopped || document.hidden) return;
      const r = await poll();
      if (!r || TERMINAL.has(r.status)) { stopped = true; clear(); return; }
      clear();
      timer = setTimeout(tick, intervalFor(r.ahead));
    };
    const onVis = () => { if (document.hidden) clear(); else if (!stopped) tick(); };
    document.addEventListener("visibilitychange", onVis);
    if (!document.hidden) { clear(); timer = setTimeout(tick, intervalFor(initial.ahead)); }
    return () => { stopped = true; clear(); document.removeEventListener("visibilitychange", onVis); };
  }, [poll, initial.ahead]);

  if (row.status === "seated") {
    return (
      <div className="rq-card flex flex-col items-center gap-3 p-8 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full text-white" style={{ background: "var(--brand-solid)" }}><IconSparkle size={28} /></span>
        <p className="font-display text-2xl font-extrabold text-[color:var(--ink)]">{tr(lang, "تفضّل، دورك جاهز", "You're up — please come in")}</p>
        <p className="text-sm text-[color:var(--muted)]">{tr(lang, `توجّه إلى الاستقبال في ${row.restaurant}.`, `Head to reception at ${row.restaurant}.`)}</p>
      </div>
    );
  }

  if (TERMINAL.has(row.status)) {
    return (
      <div className="rq-card flex flex-col items-center gap-3 p-8 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full text-white" style={{ background: "var(--brand-solid)" }}><IconHourglass size={26} /></span>
        <p className="text-lg font-extrabold text-[color:var(--ink)]">{tr(lang, "انتهى هذا الدور", "This turn has ended")}</p>
        <a href={`/r/${row.slug}`} className="rq-btn-soft mt-2 inline-flex">{tr(lang, "خذ دورًا جديدًا", "Take a new turn")}</a>
      </div>
    );
  }

  return (
    <div className="rq-card flex flex-col items-center gap-5 p-8 text-center">
      <div className="flex flex-col items-center">
        <span className="font-display text-6xl font-bold leading-none text-brand-700">{toAr(row.position)}</span>
        <span className="mt-1 text-xs font-bold tracking-widest text-[color:var(--muted)]">{tr(lang, "رقم دورك", "Your turn number")}</span>
      </div>

      <div>
        <p className="font-display text-2xl font-bold text-[color:var(--ink)]">{peopleAhead(row.ahead, lang)}</p>
        <p className="mt-1 text-sm text-[color:var(--muted)]">{row.restaurant}</p>
      </div>

      {/* خياران بضغطة — يردّ العميل بلا كتابة في واتساب */}
      <div className="w-full space-y-2.5">
        {row.confirmed ? (
          <p className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-extrabold text-white"
             style={{ background: "var(--brand-solid)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            {tr(lang, "أكّدت حضورك — ننتظرك", "Attendance confirmed — see you soon")}
          </p>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => { if (await confirmAttendance(entryId)) setRow((r) => ({ ...r, confirmed: true })); })}
            className="w-full rounded-2xl px-4 py-3.5 text-sm font-extrabold text-white transition active:scale-[0.985] disabled:opacity-60"
            style={{ background: "var(--brand-solid)", boxShadow: "0 14px 26px -16px rgba(102,28,10,0.72)" }}
          >
            {pending ? tr(lang, "جارٍ التأكيد…", "Confirming…") : tr(lang, "أكّد حضوري ✓", "Confirm I'm coming ✓")}
          </button>
        )}

        {/* الإلغاء بخطوتين — كي لا تُلغى بلمسة عابرة */}
        {!askCancel ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => setAskCancel(true)}
            className="w-full rounded-2xl border px-4 py-3 text-sm font-bold text-[color:var(--muted)] transition disabled:opacity-60"
            style={{ borderColor: "rgba(102,28,10,0.20)" }}
          >
            {tr(lang, "ألغِ دوري", "Cancel my turn")}
          </button>
        ) : (
          <div className="rounded-2xl p-3" style={{ background: "var(--surface-2)", border: "1px solid rgba(102,28,10,0.16)" }}>
            <p className="mb-2.5 text-sm font-bold text-[color:var(--ink)]">{tr(lang, "متأكّد أنك تريد إلغاء دورك؟", "Cancel your turn?")}</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => start(async () => { if (await cancelByTicket(entryId)) setRow((r) => ({ ...r, status: "cancelled" })); })}
                className="rounded-xl px-3 py-2.5 text-sm font-extrabold text-white transition active:scale-[0.97] disabled:opacity-60"
                style={{ background: "#8d2f22" }}
              >
                {pending ? tr(lang, "جارٍ…", "Working…") : tr(lang, "نعم، ألغِ", "Yes, cancel")}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setAskCancel(false)}
                className="rounded-xl border px-3 py-2.5 text-sm font-bold text-[color:var(--ink)] transition disabled:opacity-60"
                style={{ borderColor: "rgba(102,28,10,0.20)", background: "#fff" }}
              >
                {tr(lang, "تراجع", "Keep it")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
