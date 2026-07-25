"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { joinWaitlistGuest, type WaitlistState } from "./actions";
import { QueueTicket } from "./queue-ticket";
import { toAr } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";
import { recordTurn } from "@/lib/local-store";

type Branch = {
  id: string;
  name: string;
  city: string;
  total: number;
  inside: number;
  outside: number;
  accepts: boolean;
};

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
      <p className="mt-0.5 text-[11px] font-bold" style={{ color: busy ? "#fff" : "var(--brand-d)" }}>
        {busy ? tr(lang, "بالطابور", "In queue") : tr(lang, "متاح الآن", "Available now")}
      </p>
    </div>
  );
}

/** بطاقة فرع مستقلة بحالتها (نمط ريكيو) — كل فرع قسم منفصل تمامًا */
function BranchCard({ b, onSelect }: { b: Branch; onSelect: () => void }) {
  const lang = useLang();
  return (
    <button type="button" onClick={onSelect} className="reveal rq-card block w-full overflow-hidden p-3.5 text-right transition active:scale-[0.985]">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-[16px] font-bold text-[color:var(--ink)]">{b.name}</p>
          {b.city && <p className="mt-0.5 truncate text-[13px] font-medium text-[color:var(--muted)]">{b.city}</p>}
        </div>
        <span className="shrink-0 text-[color:var(--muted)]">←</span>
      </div>

      {!b.accepts ? (
        <div className="mt-2.5 flex items-center justify-between rounded-2xl px-3.5 py-2.5" style={{ background: "linear-gradient(160deg,#f3e8df,#e9d7c8)", border: "1px solid rgba(102,28,10,0.14)" }}>
          <span className="flex items-center gap-2 text-sm font-extrabold" style={{ color: "#9a6a4c" }}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#b98a6a" }} />
            {tr(lang, "لا يستقبل الآن", "Not accepting now")}
          </span>
        </div>
      ) : b.total > 0 ? (
        <div className="mt-2.5 flex items-center justify-between rounded-2xl px-3.5 py-2.5" style={{ background: "linear-gradient(150deg,#b23c1d,#661c0a)", boxShadow: "0 12px 24px -16px rgba(102,28,10,0.72)" }}>
          <span className="flex items-center gap-2 text-sm font-extrabold text-white">
            <span className="h-2.5 w-2.5 rounded-full bg-white/90" />
            {tr(lang, `${toAr(b.total)} بالطابور الآن`, `${toAr(b.total)} in queue now`)}
          </span>
          <span className="text-xs font-extrabold text-white/85">{tr(lang, "خذ دورك ←", "Take your turn ←")}</span>
        </div>
      ) : (
        <div className="mt-2.5 flex items-center justify-between rounded-2xl px-3.5 py-2.5" style={{ background: "linear-gradient(160deg,#fbf1ea,#f4ddd0)", border: "1px solid rgba(102,28,10,0.16)" }}>
          <span className="flex items-center gap-2 text-sm font-extrabold" style={{ color: "var(--brand-d)" }}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--brand-d)", boxShadow: "0 0 0 3px rgba(102,28,10,0.14)" }} />
            {tr(lang, "متاح الآن · بدون انتظار", "Available now · No wait")}
          </span>
          <span className="text-xs font-extrabold" style={{ color: "var(--brand-d)" }}>{tr(lang, "خذ دورك ←", "Take your turn ←")}</span>
        </div>
      )}
    </button>
  );
}

export function WaitlistForm({
  slug,
  branches,
  defaultName,
  defaultPhone,
  restaurantName,
  restaurantLogo,
}: {
  slug: string;
  branches: Branch[];
  defaultName: string;
  defaultPhone: string;
  restaurantName?: string;
  restaurantLogo?: string | null;
}) {
  const lang = useLang();
  const [state, formAction, pending] = useActionState<WaitlistState, FormData>(joinWaitlistGuest, { ok: false });

  const multi = branches.length > 1;
  // فرع واحد → مختار تلقائيًّا؛ عدّة فروع → يختار العميل من البطاقات أولًا
  const [branchId, setBranchId] = useState<string>(multi ? "" : branches[0]?.id ?? "");
  const [zone, setZone] = useState<"inside" | "outside">("inside");
  const branch = useMemo(() => branches.find((b) => b.id === branchId), [branchId, branches]);

  useEffect(() => {
    if (state.ok) {
      recordTurn({ slug, name: restaurantName ?? slug, logo: restaurantLogo ?? null, at: new Date().toISOString() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok]);

  if (state.ok) {
    return <QueueTicket position={state.position ?? 0} total={state.total ?? 0} entryId={state.entryId} phone={state.phone} />;
  }

  // خطوة اختيار الفرع (لمّا فيه أكثر من فرع ولم يُختَر بعد) — كل فرع بطاقة مستقلة
  if (multi && !branchId) {
    return (
      <div className="space-y-3">
        <p className="px-1 font-display text-base font-bold text-[color:var(--ink)]">{tr(lang, "اختر الفرع", "Choose a branch")}</p>
        {branches.map((b) => (
          <BranchCard key={b.id} b={b} onSelect={() => setBranchId(b.id)} />
        ))}
      </div>
    );
  }

  // مغلق / لا يستقبل الآن (لهذا الفرع)
  if (branch && !branch.accepts) {
    return (
      <div className="space-y-3">
        {multi && (
          <button type="button" onClick={() => setBranchId("")} className="text-sm font-bold text-[color:var(--brand-d)]">← {tr(lang, "فرع آخر", "Another branch")}</button>
        )}
        <div className="rq-card p-7 text-center">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "rgba(192,86,74,0.12)", color: "var(--st-closed)" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" /><path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </span>
          <p className="text-lg font-bold text-[color:var(--ink)]">{tr(lang, "لا يستقبل طلبات الانتظار الآن", "Not accepting waitlist requests right now")}</p>
          <p className="mt-1 text-sm text-[color:var(--muted)]">{tr(lang, "هذا الفرع متوقف مؤقتًا عن استقبال الطابور — تحقّق لاحقًا.", "This branch has paused its queue temporarily — check back later.")}</p>
        </div>
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

      {/* رأس الفرع المختار + تغيير الفرع */}
      {multi && branch && (
        <div className="flex items-center justify-between px-1">
          <p className="font-display text-lg font-bold text-[color:var(--ink)]">
            {branch.name}{branch.city ? <span className="text-sm font-medium text-[color:var(--muted)]"> · {branch.city}</span> : null}
          </p>
          <button type="button" onClick={() => setBranchId("")} className="text-sm font-bold text-[color:var(--brand-d)]">← {tr(lang, "فرع آخر", "Another branch")}</button>
        </div>
      )}

      {/* طابور القسم (لهذا الفرع) */}
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

      <button type="submit" disabled={pending || !branchId} className="rq-btn">
        {pending ? tr(lang, "جارٍ التسجيل…", "Registering…") : tr(lang, "خذ دورك الآن", "Take your turn now")}
      </button>
    </form>
  );
}
