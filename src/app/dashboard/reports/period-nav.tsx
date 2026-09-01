import Link from "next/link";
import { tr, type Lang } from "@/lib/i18n";
import { fmtDate } from "@/lib/dates";
import { SPAN_DAYS, type Period, shiftDayKey, reportWindow } from "./window";

/**
 * تنقّل فترة التقرير — سهمٌ للخلف، مدى النافذة، سهمٌ للأمام، ثمّ اختيار يوم.
 *
 * كان المالك عالقًا على اللحظة الراهنة: كلّ نوافذ التقرير تُحسب من
 * `Date.now()`، فلا طريق إلى أمس ولا إلى أسبوعٍ مضى. الخطوة هنا بطول الفترة
 * نفسها، فلا تتداخل نافذتان ولا تُقفز واحدة.
 *
 * مكوّنٌ مستقلّ لا كتلةٌ داخل الصفحة: الصفحة لا تُرسَم إلّا بجلسة مالكٍ
 * وقاعدةٍ حيّة، فبقاء الشريط داخلها يعني أنّه لا يُعايَن إلّا في الإنتاج.
 */
export function PeriodNav({
  lang,
  period,
  anchor,
  todayKey,
}: {
  lang: Lang;
  period: Period;
  /** آخر يومٍ في النافذة — `YYYY-MM-DD` بتوقيت الرياض */
  anchor: string;
  todayKey: string;
}) {
  const isToday = anchor === todayKey;
  const step = SPAN_DAYS[period];
  const prevKey = shiftDayKey(anchor, -step);
  const nextRaw = shiftDayKey(anchor, step);
  // «التالي» لا يتخطّى اليوم؛ وإن تخطّاه بخطوةٍ كاملة نقف عند اليوم نفسه
  // كي لا تُقفَل الرجعة من نافذةٍ قديمةٍ إلى الحاضر بضغطةٍ واحدة.
  const nextKey = nextRaw > todayKey ? todayKey : nextRaw;

  const { anchorStart, sinceDate } = reportWindow(period, anchor);
  // يومٌ واحد يُسمّى بيومه، وما طال يُكتب مدًى «من — إلى»
  const windowLabel =
    period === "day"
      ? fmtDate(anchorStart.toISOString(), lang)
      : `${fmtDate(sinceDate.toISOString(), lang)} — ${fmtDate(anchorStart.toISOString(), lang)}`;

  const hrefFor = (d: string) =>
    `/dashboard/reports?period=${period}${d === todayKey ? "" : `&date=${d}`}`;

  const arrowBox =
    "grid h-10 w-10 place-items-center rounded-2xl text-lg font-bold transition active:scale-95";
  const arrowStyle = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    color: "var(--brand-d)",
  };

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 print:hidden" data-testid="period-nav">
      <Link
        href={hrefFor(prevKey)}
        aria-label={tr(lang, "الفترة السابقة", "Previous period")}
        className={arrowBox}
        style={arrowStyle}
      >
        {/* السهم يشير إلى الماضي: يمينًا في العربية ويسارًا في الإنجليزية */}
        {lang === "en" ? "‹" : "›"}
      </Link>

      <span
        className="rounded-2xl px-4 py-2.5 text-sm font-bold"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink)" }}
      >
        {windowLabel}
      </span>

      {/* «التالي» يختفي على الحاضر بدل أن يبقى زرًّا ميّتًا يُضغط بلا أثر */}
      {isToday ? null : (
        <Link
          href={hrefFor(nextKey)}
          aria-label={tr(lang, "الفترة التالية", "Next period")}
          className={arrowBox}
          style={arrowStyle}
        >
          {lang === "en" ? "›" : "‹"}
        </Link>
      )}

      {/* القفز المباشر إلى يومٍ بعينه — نفس نمط بحث صفحة العملاء:
          ‏form method=get بلا جافاسكربت، فيعمل قبل ترطيب الصفحة وبعد فشله. */}
      <form method="get" className="flex items-center gap-2">
        <input type="hidden" name="period" value={period} />
        <input
          type="date"
          name="date"
          defaultValue={anchor}
          max={todayKey}
          aria-label={tr(lang, "اختر تاريخًا", "Pick a date")}
          className="field-input h-10 py-0"
        />
        <button className="btn btn-secondary h-10 shrink-0 px-4 text-sm">
          {tr(lang, "اذهب", "Go")}
        </button>
      </form>

      {isToday ? null : (
        <Link href={hrefFor(todayKey)} className="btn btn-secondary h-10 shrink-0 px-4 text-sm">
          {tr(lang, "اليوم", "Today")}
        </Link>
      )}
    </div>
  );
}
