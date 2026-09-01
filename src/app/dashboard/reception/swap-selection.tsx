"use client";

import { createContext, useCallback, useContext, useMemo, useState, useTransition } from "react";
import { swapQueuePositions } from "./swap-actions";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

/**
 * اختيار دورين وتبديلهما — بلا سحبٍ وإفلات وبلا «انقل إلى الموضع رقم كذا».
 *
 * الضغطة الأولى تختار، والثانية على دورٍ آخر تُنفّذ التبديل فورًا. لا حوار
 * تأكيد ولا تحذير ولا اقتراح: الاستقبال يعرف مطعمه، والنظام ينفّذ ما اختاره.
 *
 * والاختيار محصورٌ في القسم الواحد لأنّ التبديل نفسه كذلك — تبديلٌ عبر
 * قسمين يحرّك أرقام ضيوفٍ آخرين، وهو ما لا نفعله. فزرُّ من هو في قسمٍ آخر
 * يُعطَّل بصريًّا بدل أن يُضغَط فيُرفض من الخادم.
 */
type Selected = { id: string; zone: string | null; rank: number };

type Ctx = {
  selected: Selected | null;
  pending: boolean;
  error: string | null;
  pick: (e: Selected) => void;
};

const SwapCtx = createContext<Ctx | null>(null);

export function SwapSelectionProvider({ children }: { children: React.ReactNode }) {
  const [selected, setSelected] = useState<Selected | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const pick = useCallback(
    (e: Selected) => {
      setError(null);
      if (!selected) { setSelected(e); return; }
      if (selected.id === e.id) { setSelected(null); return; }   // إلغاء الاختيار
      if (selected.zone !== e.zone) { setSelected(e); return; }  // قسمٌ آخر ⇒ يصير هو المختار
      const a = selected.id;
      setSelected(null);
      start(async () => {
        const res = await swapQueuePositions(a, e.id);
        if (!res.ok) setError(res.message);
      });
    },
    [selected],
  );

  const value = useMemo(() => ({ selected, pending, error, pick }), [selected, pending, error, pick]);
  return <SwapCtx.Provider value={value}>{children}</SwapCtx.Provider>;
}

export function useSwapSelection() {
  return useContext(SwapCtx);
}

/**
 * زرّ التبديل داخل بطاقة الدور — بنفس مقاس أزرار البطاقة وحدودها ورموزها
 * (‏h-9 w-9، rounded-xl، ‎--hairline‎)، وحالةُ الاختيار بلون العلامة القائم
 * (‎--brand-solid/--brand-ink‎) المستعمل أصلًا في شارة الرقم وشارة «مميّز».
 * لا لونَ جديد ولا مقاسَ جديد.
 */
export function SwapButton({ id, zone, rank }: { id: string; zone: string | null; rank: number }) {
  const lang = useLang();
  const ctx = useSwapSelection();
  if (!ctx) return null;

  const isSelected = ctx.selected?.id === id;
  const otherZone = ctx.selected != null && ctx.selected.zone !== zone;

  return (
    <button
      type="button"
      disabled={ctx.pending || otherZone}
      onClick={() => ctx.pick({ id, zone, rank })}
      aria-pressed={isSelected}
      title={
        isSelected
          ? tr(lang, "أُلغِ الاختيار", "Cancel selection")
          : ctx.selected
            ? tr(lang, "بدّل مع المختار", "Swap with selected")
            : tr(lang, "اختر للتبديل", "Select to swap")
      }
      className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--hairline)] text-[color:var(--brand-d)] transition hover:bg-[rgba(102,28,10,0.08)] disabled:opacity-40"
      style={isSelected ? { background: "var(--brand-solid)", color: "var(--brand-ink)" } : { background: "var(--surface-2)" }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M7 4 3 8l4 4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 8h13" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        <path d="m17 20 4-4-4-4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M21 16H8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    </button>
  );
}

/**
 * سطرُ الخطأ — يظهر فقط حين ترفض القاعدة، وبنفس نبرة رسائل الاستقبال.
 * لا يظهر شيءٌ في الحالة الطبيعيّة، فلا تتغيّر الشاشة ما لم يقع خطأ.
 */
export function SwapError() {
  const ctx = useSwapSelection();
  if (!ctx?.error) return null;
  return (
    <p className="mb-3 text-sm font-bold" style={{ color: "var(--danger)" }}>
      {ctx.error}
    </p>
  );
}
