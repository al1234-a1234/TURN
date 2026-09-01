/**
 * إحصاء زمن «من الانضمام حتى التجليس» — تعريفٌ واحدٌ لثلاث شاشات.
 *
 * كان الحساب مكرَّرًا حرفيًّا في ثلاثة ملفّات (لوحة المالك، الإدارة،
 * التقارير) وفي دالّتين في القاعدة — خمسةُ مواضع، أربعةٌ منها متّفقة وواحد
 * شاذّ. وتكرار التعريف هو ما يسمح بانحرافه، فجُمع الحسابُ هنا.
 *
 * ■ ما يقيسه هذا الرقم بالضبط — وهو غير ما يوحي به اسمه القديم:
 *   الفرق بين `joined_at` و`seated_at`. و`seated_at` يُكتب لحظةَ ضغط
 *   الاستقبال زرَّ «جلس» (waitlist-actions.ts:17)، لا لحظةَ جلوس الضيف.
 *   فالرقم يشمل زمن تسجيل الاستقبال، وليس انتظار الضيف وحده.
 *   وقِيس على الإنتاج أنّ الفارق ليس نظريًّا: `notified_at` فارغٌ في ١٤٢
 *   من ١٤٤ صفًّا، أي أنّ لحظة النداء غير مسجَّلة أصلًا فلا سبيل لفصلها.
 *
 * ■ ولماذا الوسيط بجانب المتوسّط: المتوسّط وحده يخفي الالتواء. قِيس على
 *   الإنتاج (٧ أيام): Pizza peel متوسّط ١٣٣٫٤ د ووسيط ١٠٨٫٣ د، وEficto
 *   متوسّط ٤٫٤ د ووسيط ٥٫٠ د. والفجوة بينهما هي الخبر. وتقرير تلغرام
 *   (0176) يعرض الاثنين منذ إنشائه — فهذا توحيدٌ للشاشات معه لا اختراع.
 */

/** سقف الشواذ بالدقائق — نفسه في الشاشات الثلاث وتقرير تلغرام و`rollup_daily_stats` (٠٢٠٠). */
export const WAIT_MAX_MIN = 600;

export type WaitRowLike = { joined_at: string; seated_at: string | null };

export type WaitStats = {
  /** المتوسّط الحسابي بالدقائق، مقرَّبًا */
  avg: number;
  /** الوسيط بالدقائق، مقرَّبًا */
  median: number;
  /** كم صفًّا دخل الحساب فعلًا بعد إسقاط الشواذّ */
  n: number;
};

/**
 * الدقائق المقبولة من صفوفٍ جُلِّست: `0 ≤ د < 600`.
 * الصفر مقبولٌ عمدًا (تجليسٌ فوريّ واقعٌ يوميًّا)، والسالب مرفوض لأنه
 * يعني ساعةَ خادمٍ مضطربة لا انتظارًا.
 */
export function waitMinutes(rows: readonly WaitRowLike[]): number[] {
  return rows
    .filter((r) => r.seated_at)
    .map((r) => (new Date(r.seated_at as string).getTime() - new Date(r.joined_at).getTime()) / 60000)
    .filter((n) => n >= 0 && n < WAIT_MAX_MIN);
}

/** الوسيط — بمتوسّط الأوسطين في العدد الزوجيّ. */
function medianOf(sorted: readonly number[]): number {
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** المتوسّط والوسيط معًا — بلا صفوفٍ يعطي أصفارًا لا NaN. */
export function waitStats(rows: readonly WaitRowLike[]): WaitStats {
  const mins = waitMinutes(rows);
  if (!mins.length) return { avg: 0, median: 0, n: 0 };
  const sorted = [...mins].sort((a, b) => a - b);
  const avg = mins.reduce((a, c) => a + c, 0) / mins.length;
  return { avg: Math.round(avg), median: Math.round(medianOf(sorted)), n: mins.length };
}
