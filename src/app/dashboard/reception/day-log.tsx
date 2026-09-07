"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { restoreQueueEntry } from "./day-log-actions";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";
import { fmtTime } from "@/lib/dates";
import { toAr } from "@/lib/format";

/**
 * سجلّ اليوم — وهو **شاشة التصحيح** لا عرضًا للاطّلاع.
 *
 * الدورة التشغيليّة التي وُلد منها: الموظّف يزيل أو يجلّس بالخطأ ← يرى ذلك
 * هنا ← يضغط «إرجاع» من السطر نفسه ← ثمّ (لاحقًا) يسحبه لموضعه الصحيح.
 * فزرّ الإرجاع يعيش داخل السطر، لا في شاشةٍ أخرى.
 *
 * ── الأرقام هنا رتبٌ مشتقّة، لا العمود الخام ──
 * `from_rank` و`to_rank` لقطتان حُسبتا **لحظةَ الحدث** داخل القسم (عددُ من
 * أمامه + ١). وعمود `position` يُعاد استخدامه بعد خروج الصفوف، فعرضُه كان
 * سيُظهر للموظّف رقمًا لا يطابق ما رآه العميل.
 *
 * ── وبنيةٌ مفتوحةٌ لحركة السحب ──
 * `moved` نوعٌ معرَّفٌ أصلًا في القاعدة ويُعرض هنا بـ«من رقم ← إلى رقم».
 * فحين تُبنى ميزة السحب لا يُعاد بناء السجلّ: يكتب حدثًا بنوع `moved` فيظهر.
 */

export type DayLogRow = {
  event_id: string;
  entry_id: string | null;
  kind: string;
  zone: string | null;
  from_rank: number | null;
  to_rank: number | null;
  at: string;
  customer_name: string | null;
  actor_name: string | null;
  /** اسم مقابل التبديل (kind === "swapped" فقط) — من detail الآن، لا يعود بطاقةً واحدة تمثّل الطرفين. */
  counterpart_name: string | null;
  restorable: boolean;
};

const KIND_AR: Record<string, string> = {
  notified: "نُبّه",
  seated: "جلس",
  cancelled: "أُزيل",
  expired: "انتهت مهلته",
  no_show: "لم يحضر",
  restored: "أُرجع",
  moved: "حُرّك",
  swapped: "بُدِّل موضعه",
};
const KIND_EN: Record<string, string> = {
  notified: "Notified",
  seated: "Seated",
  cancelled: "Removed",
  expired: "Timed out",
  no_show: "No-show",
  restored: "Restored",
  moved: "Moved",
  swapped: "Position swapped",
};

/** لونٌ يفرّق الفعل بنظرة: الإزالة تنبيه، الجلوس إنجاز، الإرجاع تصحيح. */
function toneOf(kind: string): string {
  if (kind === "seated") return "var(--brand-solid)";
  if (kind === "cancelled" || kind === "expired" || kind === "no_show") return "var(--st-closed)";
  if (kind === "restored" || kind === "moved" || kind === "swapped") return "var(--brand-d)";
  return "var(--muted)";
}

/**
 * تصفّح تاريخيّ فوق نفس السجل: offset=0 هي الشاشة الحيّة (نافذة ٨ ساعات
 * متحرّكة، سلوكها الأصليّ بلا أي تغيير)، وoffset≥1 يوم تقويميّ كامل
 * (بتوقيت الرياض) قبل اليوم بهذا العدد — يُحسب في page.tsx ويُمرَّر هنا
 * جاهزًا (dateLabel) كي لا يتكرّر منطق التاريخ في مكوّنٍ عرضيّ.
 */
export function DayLog({
  rows,
  branchId,
  offset,
  dateLabel,
  dateISO,
  todayISO,
}: {
  rows: DayLogRow[];
  branchId: string;
  offset: number;
  dateLabel: string | null;
  /** تاريخ اليوم المعروض حاليًا (yyyy-mm-dd بتوقيت الرياض) — قيمة أولية لحقل التاريخ. */
  dateISO: string;
  /** تاريخ اليوم الفعليّ (yyyy-mm-dd) — سقف الاختيار، لا تاريخ مستقبليّ. */
  todayISO: string;
}) {
  const lang = useLang();
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  const SHOWN = 8;
  const visible = expanded ? rows : rows.slice(0, SHOWN);

  function restore(row: DayLogRow) {
    if (!row.entry_id) return;
    setBusy(row.event_id);
    setErr(null);
    start(async () => {
      const res = await restoreQueueEntry(row.entry_id!);
      setBusy(null);
      if (res.ok) setDone((s) => new Set(s).add(row.event_id));
      else setErr(res.error);
    });
  }

  const hrefFor = (o: number) => `?branch=${branchId}${o > 0 ? `&logOffset=${o}` : ""}`;

  // اختيار تاريخٍ مباشرةً بدل النقر يومًا يومًا للرجوع أسابيع — فرق تاريخين
  // مكتوبين (yyyy-mm-dd) لا فرق توقيتٍ كامل، فبلا أي تعقيد مناطق زمنيّة هنا.
  function pickDate(picked: string) {
    if (!picked) return;
    const [py, pm, pd] = picked.split("-").map(Number);
    const [ty, tm, td] = todayISO.split("-").map(Number);
    const diffDays = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(py, pm - 1, pd)) / 86_400_000);
    router.push(hrefFor(Math.max(0, diffDays)));
  }

  const Nav = () => (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href={hrefFor(offset + 1)}
        className="rounded-full px-2.5 py-1 text-xs font-extrabold transition"
        style={{ background: "var(--surface-2)", color: "var(--brand-d)" }}
        aria-label={tr(lang, "اليوم السابق", "Previous day")}
      >
        {tr(lang, "◂ أقدم", "◂ Older")}
      </Link>
      <span className="text-xs font-bold text-[color:var(--muted)]">
        {offset === 0 ? tr(lang, "حركة الجلسة الحاليّة", "Current session") : dateLabel}
      </span>
      {offset > 0 && (
        <Link
          href={hrefFor(offset - 1)}
          className="rounded-full px-2.5 py-1 text-xs font-extrabold transition"
          style={{ background: "var(--surface-2)", color: "var(--brand-d)" }}
          aria-label={tr(lang, "اليوم التالي", "Next day")}
        >
          {tr(lang, "أحدث ▸", "Newer ▸")}
        </Link>
      )}
      <input
        type="date"
        value={dateISO}
        max={todayISO}
        onChange={(e) => pickDate(e.target.value)}
        aria-label={tr(lang, "اختر تاريخًا", "Pick a date")}
        className="rounded-full border border-[var(--hairline)] px-2 py-1 text-xs font-extrabold outline-none"
        style={{ background: "var(--surface-2)", color: "var(--brand-d)" }}
      />
    </div>
  );

  if (!rows.length) {
    return (
      <div className="soft-card mt-6 p-5">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-lg font-bold text-[color:var(--ink)]">
            {tr(lang, "سجلّ اليوم", "Today's log")}
          </h3>
          <Nav />
        </div>
        <p className="text-sm text-[color:var(--muted)]">
          {offset === 0
            ? tr(lang, "لا حركة بعد في هذه الجلسة.", "No activity yet this session.")
            : tr(lang, "لا حركة مسجَّلة في هذا اليوم.", "No activity recorded that day.")}
        </p>
      </div>
    );
  }

  return (
    <div className="soft-card mt-6 p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg font-bold text-[color:var(--ink)]">
          {tr(lang, "سجلّ اليوم", "Today's log")}
        </h3>
        <Nav />
      </div>

      {err && (
        <p className="mb-3 text-xs font-extrabold text-[color:var(--danger)]">{err}</p>
      )}

      <ul className="space-y-2">
        {visible.map((r) => {
          const label = (lang === "en" ? KIND_EN : KIND_AR)[r.kind] ?? r.kind;
          const restored = done.has(r.event_id);
          return (
            <li
              key={r.event_id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl px-3 py-2.5"
              style={{ background: "var(--surface-2)" }}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: toneOf(r.kind) }} />
              <span className="font-bold text-[color:var(--ink)]">
                {r.customer_name || tr(lang, "ضيف", "Guest")}
              </span>
              <span className="text-sm" style={{ color: toneOf(r.kind) }}>{label}</span>

              {/* من رقمٍ إلى رقم — رتبٌ مشتقّة لا العمود الخام */}
              {(r.kind === "moved" || r.kind === "swapped") && r.from_rank != null && r.to_rank != null ? (
                <span className="text-sm text-[color:var(--muted)]">
                  {tr(lang, `من ${toAr(r.from_rank)} إلى ${toAr(r.to_rank)}`, `#${r.from_rank} → #${r.to_rank}`)}
                  {r.kind === "swapped" && r.counterpart_name && (
                    <> · {tr(lang, `تبادل مع ${r.counterpart_name}`, `swapped with ${r.counterpart_name}`)}</>
                  )}
                </span>
              ) : r.from_rank != null ? (
                <span className="text-sm text-[color:var(--muted)]">
                  {tr(lang, `رقمه كان ${toAr(r.from_rank)}`, `was #${r.from_rank}`)}
                </span>
              ) : null}

              <span className="text-xs text-[color:var(--muted)]">{fmtTime(r.at, lang)}</span>
              {r.actor_name && (
                <span className="text-xs text-[color:var(--muted)]">
                  {tr(lang, `بواسطة ${r.actor_name}`, `by ${r.actor_name}`)}
                </span>
              )}

              <span className="ms-auto">
                {restored ? (
                  <span className="text-xs font-extrabold" style={{ color: "var(--brand-d)" }}>
                    {tr(lang, "أُرجع ✓", "Restored ✓")}
                  </span>
                ) : r.restorable ? (
                  <button
                    type="button"
                    disabled={pending && busy === r.event_id}
                    onClick={() => restore(r)}
                    className="rounded-full px-3 py-1 text-xs font-extrabold disabled:opacity-50"
                    style={{ background: "var(--brand-solid)", color: "var(--cream-100, #fff)" }}
                  >
                    {busy === r.event_id
                      ? tr(lang, "…", "…")
                      : tr(lang, "إرجاع", "Restore")}
                  </button>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>

      {rows.length > SHOWN && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 text-sm font-bold text-[color:var(--brand-d)]"
        >
          {expanded
            ? tr(lang, "عرض أقل", "Show less")
            : tr(lang, `عرض المزيد (${toAr(rows.length - SHOWN)})`, `Show more (${rows.length - SHOWN})`)}
        </button>
      )}
    </div>
  );
}
