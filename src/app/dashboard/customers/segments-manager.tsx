"use client";

import { useRef, useState, useTransition } from "react";
import { createSegment, deleteSegment } from "./actions";
import { toAr } from "@/lib/format";
import { tr, type Lang } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

export type CustomSegment = {
  id: string;
  name: string;
  min_visits: number;
  max_visits: number | null;
  inactive_days: number | null;
  member_count: number;
};

/** شرح الشرط بلغة المالك لا بلغة القاعدة: «٥–٩ زيارات ولم يزر منذ ٣٠ يومًا». */
function ruleLabel(s: CustomSegment, lang: Lang): string {
  const visits =
    s.max_visits === null
      ? tr(lang, `${toAr(s.min_visits)} زيارات فأكثر`, `${toAr(s.min_visits)} visits or more`)
      : tr(
          lang,
          `${toAr(s.min_visits)}–${toAr(s.max_visits)} زيارات`,
          `${toAr(s.min_visits)}–${toAr(s.max_visits)} visits`,
        );
  if (s.inactive_days === null) return visits;
  return (
    visits +
    tr(lang, ` ولم يزر منذ ${toAr(s.inactive_days)} يومًا`, ` and no visit in ${toAr(s.inactive_days)} days`)
  );
}

/**
 * شرائح المالك المخصّصة.
 *
 * العضوية تُحسب لحظةَ العرض من الزيارات وآخر زيارة، فلا حاجة لتحديث يدوي:
 * العميل يدخل الشريحة ويخرج منها مع كل زيارة.
 */
export function SegmentsManager({ segments }: { segments: CustomSegment[] }) {
  const lang = useLang();
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <section className="soft-card space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-base font-bold text-[color:var(--ink)]">
            🏷️ {tr(lang, "شرائح عملائك", "Your customer segments")}
          </p>
          <p className="mt-0.5 text-sm text-[color:var(--muted)]">
            {tr(
              lang,
              "عرّف عميلك المميّز بمقياسك أنت، وأرسل له حملة بضغطة.",
              "Define your best customers by your own rule, then reach them in one tap.",
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="btn btn-secondary shrink-0 px-4"
        >
          {adding ? tr(lang, "إلغاء", "Cancel") : tr(lang, "＋ شريحة", "＋ Segment")}
        </button>
      </div>

      {adding && (
        <form
          ref={formRef}
          action={(fd) =>
            start(async () => {
              await createSegment(fd);
              formRef.current?.reset();
              setAdding(false);
            })
          }
          className="space-y-3 rounded-2xl p-3"
          style={{ background: "var(--surface-2)" }}
        >
          <div>
            <label className="field-label" htmlFor="seg-name">{tr(lang, "اسم الشريحة", "Segment name")}</label>
            <input
              id="seg-name"
              name="name"
              required
              maxLength={40}
              className="field-input"
              placeholder={tr(lang, "مثال: ذهبي", "e.g. Gold")}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="field-label" htmlFor="seg-min">{tr(lang, "من عدد زيارات", "From visits")}</label>
              <input id="seg-min" name="min_visits" inputMode="numeric" dir="ltr" defaultValue="5" className="field-input" />
            </div>
            <div>
              <label className="field-label" htmlFor="seg-max">{tr(lang, "إلى (اختياري)", "To (optional)")}</label>
              <input
                id="seg-max"
                name="max_visits"
                inputMode="numeric"
                dir="ltr"
                className="field-input"
                placeholder={tr(lang, "بلا سقف", "No cap")}
              />
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="seg-inactive">
              {tr(lang, "ولم يزر منذ (اختياري، بالأيام)", "And no visit in (optional, days)")}
            </label>
            <input
              id="seg-inactive"
              name="inactive_days"
              inputMode="numeric"
              dir="ltr"
              className="field-input"
              placeholder={tr(lang, "اتركه فارغًا = بلا شرط غياب", "Leave empty = no absence rule")}
            />
          </div>

          <button type="submit" disabled={pending} className="btn btn-primary w-full">
            {pending ? "…" : tr(lang, "أضف الشريحة", "Add segment")}
          </button>
        </form>
      )}

      {segments.length === 0 ? (
        <div className="rounded-2xl py-8 text-center" style={{ background: "var(--surface-2)" }}>
          <p className="text-2xl">🏷️</p>
          <p className="mt-2 font-bold text-[color:var(--ink)]">
            {tr(lang, "لا شرائح بعد", "No segments yet")}
          </p>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            {tr(
              lang,
              "ابدأ بشريحتين: فضّي: ٥ زيارات · ذهبي: ١٠ زيارات",
              "Start with two: Silver: 5 visits · Gold: 10 visits",
            )}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {segments.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-3 rounded-2xl p-3"
              style={{ background: "var(--surface-2)" }}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-[color:var(--ink)]">{s.name}</p>
                <p className="mt-0.5 text-xs text-[color:var(--muted)]">{ruleLabel(s, lang)}</p>
              </div>
              <span className="chip shrink-0">
                {tr(lang, `${toAr(s.member_count)} عميل`, `${toAr(s.member_count)} customers`)}
              </span>
              <form action={deleteSegment} className="shrink-0">
                <input type="hidden" name="id" value={s.id} />
                <button
                  className="flex h-9 w-9 items-center justify-center rounded-full text-sm transition"
                  style={{ background: "var(--surface)", color: "var(--danger)", border: "1px solid var(--border)" }}
                  title={tr(lang, "حذف الشريحة", "Delete segment")}
                  aria-label={tr(lang, "حذف الشريحة", "Delete segment")}
                >
                  ✕
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
