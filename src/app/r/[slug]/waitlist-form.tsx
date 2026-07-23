"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { joinWaitlistGuest, type WaitlistState } from "./actions";
import { QueueTicket } from "./queue-ticket";
import { toAr } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";
import { recordTurn } from "@/lib/local-store";

type Branch = { id: string; name: string; total: number; inside: number; outside: number };

function ZoneStat({ label, count }: { label: string; count: number }) {
  const lang = useLang();
  const busy = count > 0;
  return (
    <div
      className="rounded-3xl p-4 text-center"
      style={
        busy
          ? { background: "linear-gradient(155deg,#b23c1d,#661c0a)", boxShadow: "0 14px 26px -16px rgba(102,28,10,0.72)" }
          : { background: "linear-gradient(160deg,#faefe8,#f4ddd0)", border: "1px solid rgba(102,28,10,0.14)" }
      }
    >
      <p className="font-display text-3xl font-bold" style={{ color: busy ? "#fff" : "var(--brand-d)" }}>
        {busy ? toAr(count) : "0"}
      </p>
      <p className="mt-1 text-xs font-bold" style={{ color: busy ? "rgba(255,255,255,0.9)" : "var(--muted)" }}>{label}</p>
      <p className="mt-0.5 text-[11px] font-bold" style={{ color: busy ? "#fff" : "var(--st-open)" }}>
        {busy ? tr(lang, "بالطابور", "In queue") : tr(lang, "متاح الآن", "Available now")}
      </p>
    </div>
  );
}

export function WaitlistForm({
  slug,
  branches,
  accepts,
  defaultName,
  defaultPhone,
  restaurantName,
  restaurantLogo,
}: {
  slug: string;
  branches: Branch[];
  accepts: boolean;
  defaultName: string;
  defaultPhone: string;
  restaurantName?: string;
  restaurantLogo?: string | null;
}) {
  const lang = useLang();
  const [state, formAction, pending] = useActionState<WaitlistState, FormData>(
    joinWaitlistGuest,
    { ok: false },
  );

  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [zone, setZone] = useState<"inside" | "outside">("inside");
  const branch = useMemo(
    () => branches.find((b) => b.id === branchId) ?? branches[0],
    [branchId, branches],
  );

  // سجّل الدور في يوميات الضيف عند نجاح الانضمام (تخزين محلّي)
  useEffect(() => {
    if (state.ok) {
      recordTurn({ slug, name: restaurantName ?? slug, logo: restaurantLogo ?? null, at: new Date().toISOString() });
    }
    // نعتمد فقط على تغيّر نجاح الحالة
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok]);

  if (state.ok) {
    return (
      <QueueTicket
        position={state.position ?? 0}
        total={state.total ?? 0}
        entryId={state.entryId}
        phone={state.phone}
      />
    );
  }

  // مغلق / لا يستقبل الآن
  if (!accepts) {
    return (
      <div className="rq-card p-7 text-center">
        <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "rgba(192,86,74,0.12)", color: "var(--st-closed)" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" /><path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </span>
        <p className="text-lg font-bold text-[color:var(--ink)]">{tr(lang, "لا يستقبل طلبات الانتظار الآن", "Not accepting waitlist requests right now")}</p>
        <p className="mt-1 text-sm text-[color:var(--muted)]">{tr(lang, "المطعم متوقف مؤقتًا عن استقبال الطابور.", "The restaurant has paused its queue temporarily.")}</p>
        <button className="rq-btn-soft mt-5">{tr(lang, "أخبرني عندما يفتح الاستقبال", "Notify me when it reopens")}</button>
      </div>
    );
  }

  const inside = branch?.inside ?? 0;
  const outside = branch?.outside ?? 0;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="branch_id" value={branchId} />
      <input type="hidden" name="zone" value={zone} />

      {/* طابور كل قسم */}
      <div className="grid grid-cols-2 gap-3">
        <ZoneStat label={tr(lang, "طاولات داخلية", "Indoor tables")} count={inside} />
        <ZoneStat label={tr(lang, "طاولات خارجية", "Outdoor tables")} count={outside} />
      </div>

      {/* اختيار القسم */}
      <div className="rq-card p-4">
        <p className="field-label mb-2">{tr(lang, "اختر مكانك", "Choose your spot")}</p>
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[color:var(--surface-2)] p-1">
          {(["inside", "outside"] as const).map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => setZone(z)}
              data-active={zone === z}
              className="rq-seg-btn"
              style={zone === z ? undefined : { background: "transparent" }}
            >
              {z === "inside" ? tr(lang, "طاولة داخلية", "Indoor table") : tr(lang, "طاولة خارجية", "Outdoor table")}
            </button>
          ))}
        </div>
      </div>

      {branches.length > 1 && (
        <div className="rq-card p-5">
          <label className="field-label">{tr(lang, "الفرع", "Branch")}</label>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="field-input">
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* اسم + رقم */}
      <div className="rq-card space-y-4 p-5">
        <div className="text-right">
          <p className="font-display text-lg font-bold text-[color:var(--ink)]">{tr(lang, "سجّل بياناتك وخذ دورك", "Enter your details and take your turn")}</p>
          <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-[color:var(--sage)] px-3 py-1 text-xs font-bold text-brand-800">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            {tr(lang, "بلا حساب ولا كلمة مرور", "No account, no password")}
          </span>
        </div>
        <div>
          <label htmlFor="full_name" className="field-label">{tr(lang, "الاسم", "Name")}</label>
          <input id="full_name" name="full_name" required defaultValue={defaultName} className="field-input" placeholder={tr(lang, "اكتب اسمك", "Enter your name")} />
        </div>
        <div>
          <label htmlFor="phone" className="field-label">{tr(lang, "رقم الجوّال", "Mobile number")}</label>
          <input id="phone" name="phone" required dir="ltr" inputMode="tel" defaultValue={defaultPhone} className="field-input text-left" placeholder="05xxxxxxxx" />
        </div>
      </div>

      {state.error && (
        <p className="rounded-2xl border border-[rgba(200,70,70,0.3)] bg-[rgba(200,70,70,0.06)] px-4 py-3 text-sm font-medium text-red-600">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="rq-btn">
        {pending ? tr(lang, "جارٍ التسجيل…", "Registering…") : tr(lang, "خذ دورك الآن", "Take your turn now")}
      </button>
    </form>
  );
}
