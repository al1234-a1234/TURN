"use client";

import { useState, useTransition } from "react";
import { setBranchStatus } from "./status-actions";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

/**
 * تحكّم تشغيلي سريع بحالة الفرع — للاستقبال والمالك معًا، بلا حاجة لصلاحية
 * "الإعدادات" الكاملة: إغلاق فوري يوقف الانضمام تمامًا، و"مزدحم الآن" مؤشّر
 * فقط لا يمنع أحدًا. تحديث متفائل فورًا ثم مزامنة مع الخادم بالخلفية.
 */
export function StatusToggle({
  branchId,
  closedNow,
  busyNow,
  closedByHours,
}: {
  branchId: string;
  closedNow: boolean;
  busyNow: boolean;
  /** الفرع مغلق حاليًا حسب أوقات الدوام المضبوطة (لا يدويًّا) — إعلامي فقط. */
  closedByHours: boolean;
}) {
  const lang = useLang();
  const [closed, setClosed] = useState(closedNow);
  const [busy, setBusy] = useState(busyNow);
  const [err, setErr] = useState(false);
  const [pending, start] = useTransition();

  function toggle(nextClosed: boolean, nextBusy: boolean) {
    const prev = { closed, busy };
    setClosed(nextClosed);
    setBusy(nextBusy);
    start(async () => {
      // فشل الخادم (لا حقّ على الفرع/شبكة) → نتراجع بدل واجهةٍ تكذب:
      // «مغلق» معروضًا والفرع مفتوح فعليًّا في القاعدة
      const ok = await setBranchStatus(branchId, nextClosed, nextBusy);
      if (!ok) { setClosed(prev.closed); setBusy(prev.busy); setErr(true); }
      else setErr(false);
    });
  }

  return (
    <div className="soft-card mb-5 flex flex-wrap items-center gap-2.5 p-3.5">
      <button
        type="button"
        role="switch"
        aria-checked={closed}
        disabled={pending}
        onClick={() => toggle(!closed, closed ? busy : false)}
        className="flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-sm font-extrabold transition disabled:opacity-60"
        style={
          closed
            ? { background: "var(--brand-solid)", color: "var(--brand-ink)" }
            : { background: "var(--brand-solid)", color: "var(--brand-ink)" }
        }
      >
        <span className="h-2.5 w-2.5 rounded-full bg-white/90" />
        {closed ? tr(lang, "الفرع مُغلق يدويًا — اضغط للفتح", "Manually closed — tap to reopen") : tr(lang, "أغلق الفرع الآن", "Close branch now")}
      </button>

      <button
        type="button"
        role="switch"
        aria-checked={busy}
        disabled={pending || closed}
        onClick={() => toggle(closed, !busy)}
        className="flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-sm font-extrabold transition disabled:opacity-60"
        style={
          busy
            ? { background: "var(--brand-solid)", color: "var(--brand-ink)" }
            : { background: "var(--brand-solid)", color: "var(--brand-ink)" }
        }
      >
        <span className="h-2.5 w-2.5 rounded-full bg-white/90" />
        {busy ? tr(lang, "مزدحم الآن — اضغط للإلغاء", "Busy now — tap to clear") : tr(lang, "علّم الفرع مزدحمًا الآن", "Mark branch busy now")}
      </button>

      {!closed && closedByHours && (
        <span className="text-xs font-bold" style={{ color: "var(--muted)" }}>
          {tr(lang, "⏱ خارج أوقات الدوام المضبوطة — يظهر للعميل مغلقًا تلقائيًا", "⏱ Outside configured hours — customers see it as closed automatically")}
        </span>
      )}
      {closed && (
        <span className="text-xs font-bold" style={{ color: "var(--muted)" }}>
          {tr(lang, "أمان النسيان: يُفتح تلقائيًّا فجر كل يوم", "Forget-safe: reopens automatically at dawn daily")}
        </span>
      )}
      {err && (
        <span className="text-xs font-extrabold text-[color:var(--danger)]">
          {tr(lang, "تعذّر الحفظ — حدّث الصفحة وحاول ثانية", "Couldn't save — refresh and retry")}
        </span>
      )}
    </div>
  );
}
