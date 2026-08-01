"use client";

import { useCallback, useState, useTransition } from "react";
import { IconGift } from "@/components/icons";
import { lookupRewards, redeemAtCounter, type CounterReward } from "./reward-actions";
import { RewardScanner } from "./reward-scanner";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";
import { toAr, normalizePhone } from "@/lib/format";
import { fmtDate } from "@/lib/dates";

/**
 * صندوق «اعتمد هدية» عند الكاشير — الحلقة الأخيرة التي كانت مفقودة:
 * العميل يعرض هديته (رمز أو رقم جوّاله)، الموظّف يتحقّق ويعتمد بضغطة،
 * فتُقفل الهدية نهائيًّا في القاعدة ولا تُصرف مرتين.
 */
export function RewardBox() {
  const lang = useLang();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<CounterReward[] | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [pending, start] = useTransition();

  function search() {
    const query = q.trim();
    if (!query) return;
    start(async () => {
      setRows(await lookupRewards(query));
      setDone({});
    });
  }

  // مسح الكاميرا: الرمز يتعبّأ ويُبحث عنه فورًا — بلا ضغطة إضافية
  const onScanned = useCallback((code: string) => {
    setQ(code);
    start(async () => {
      setRows(await lookupRewards(code));
      setDone({});
    });
  }, []);

  function redeem(id: string) {
    start(async () => {
      const ok = await redeemAtCounter(id);
      if (ok) setDone((d) => ({ ...d, [id]: true }));
    });
  }

  const valueLabel = (r: CounterReward) =>
    r.value == null
      ? null
      : r.value_kind === "percent"
        ? `${toAr(r.value)}٪`
        : `${toAr(r.value)} ${tr(lang, "ر.س", "SAR")}`;

  return (
    <section className="soft-card mb-6 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl text-cream-100" style={{ background: "var(--brand-solid)" }}><IconGift size={18} /></span>
        <div>
          <h2 className="font-display text-base font-bold text-[color:var(--ink)]">{tr(lang, "اعتمد هدية", "Redeem a gift")}</h2>
          <p className="text-[11px] font-bold text-[color:var(--muted)]">{tr(lang, "رمز الهدية أو رقم جوّال العميل", "Gift code or customer mobile")}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") search(); }}
          dir="ltr"
          className="field-input flex-1 text-left"
          placeholder={tr(lang, "A7K2M9 أو 05xxxxxxxx", "A7K2M9 or 05xxxxxxxx")}
        />
        <button onClick={search} disabled={pending || !q.trim()} className="btn btn-primary shrink-0 px-5">
          {pending ? "…" : tr(lang, "بحث", "Find")}
        </button>
        <RewardScanner lang={lang} onCode={onScanned} />
      </div>

      {rows !== null && (
        rows.length === 0 ? (
          <p className="mt-3 rounded-2xl px-4 py-3 text-center text-sm font-bold"
             style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
            {normalizePhone(q).length >= 9
              ? tr(lang, "لا هدايا فعّالة لهذا الرقم.", "No active gifts for this number.")
              : tr(lang, "لا هدية بهذا الرمز — تأكد من الأحرف.", "No gift with this code — check the letters.")}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-2xl border p-3"
                  style={{ borderColor: "rgba(102,28,10,0.12)", background: "var(--surface-2)" }}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold text-[color:var(--ink)]">
                    {r.title}{valueLabel(r) ? ` · ${valueLabel(r)}` : ""}
                  </p>
                  <p className="mt-0.5 text-[11px] font-bold text-[color:var(--muted)]">
                    {(r.customer_name ?? tr(lang, "عميل", "Customer"))}
                    {r.code ? <span dir="ltr"> · {r.code}</span> : null}
                    {r.expires_at ? ` · ${tr(lang, "تنتهي", "Expires")} ${fmtDate(r.expires_at, lang)}` : ""}
                  </p>
                </div>
                {done[r.id] ? (
                  <span className="shrink-0 rounded-full px-3 py-1.5 text-xs font-extrabold"
                        style={{ background: "var(--sage)", color: "var(--brand-d)" }}>
                    ✓ {tr(lang, "اعتُمدت", "Redeemed")}
                  </span>
                ) : (
                  <button onClick={() => redeem(r.id)} disabled={pending}
                          className="shrink-0 rounded-xl px-4 py-2 text-xs font-extrabold text-cream-100"
                          style={{ background: "var(--brand-solid)" }}>
                    {tr(lang, "اعتمد", "Redeem")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  );
}
