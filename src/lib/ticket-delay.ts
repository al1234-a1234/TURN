"use client";

/**
 * آخر موضعٍ معروف لتذكرة العميل بطابوره — محفوظٌ محليًّا (sessionStorage)
 * ليكتشف الاستطلاعُ تراجعًا في الموضع حتى لو أعاد العميل فتح الصفحة بعد
 * تبديلٍ حصل وهو غائبٌ عنها؛ الذاكرة وحدها (React state) لا تغطّي أغلب
 * الحالات الواقعية لأنها تُمحى بإغلاق التبويب أو تحديث الصفحة.
 *
 * ليست مصدر حقيقة: تُستبدل بكل استطلاع، ولا قيمة لها بعد إغلاق الجلسة.
 * نفس أسلوب src/lib/peek.ts (تخزينٌ كماليّ محاطٌ بمحاولة/التقاط، لا يكسر
 * الاستطلاع إن فشل).
 */

export function readLastKnownPosition(entryId: string): number | null {
  try {
    const raw = sessionStorage.getItem(`qpos:${entryId}`);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function writeLastKnownPosition(entryId: string, position: number) {
  try {
    sessionStorage.setItem(`qpos:${entryId}`, String(position));
  } catch {
    /* وضع خاص أو تخزين ممتلئ — لا يكسر الاستطلاع */
  }
}

/**
 * مدّة ظهور تنبيه «تراجع الموضع» على الشاشة — كانت مربوطةً بدورة الاستطلاع
 * نفسها (تظهر لحظة اكتشاف التراجع، وتختفي عند أول استطلاعٍ تالٍ) فيراها
 * العميل القريب من الأول (استطلاعٌ كل ١٠ث) ومضةً لا يتّسع وقتها للقراءة.
 * الآن وقت الاكتشاف يُختم بطابعٍ زمني (`markDelayDetected`) ويبقى التنبيه
 * ظاهرًا طالما لم تنقضِ هذي المدّة، بصرف النظر عن عدد الاستطلاعات بينها.
 */
const DELAY_BANNER_MS = 120_000;

export function markDelayDetected(entryId: string) {
  try {
    sessionStorage.setItem(`qdelay:${entryId}`, String(Date.now()));
  } catch {
    /* وضع خاص أو تخزين ممتلئ — لا يكسر الاستطلاع */
  }
}

export function isDelayRecent(entryId: string): boolean {
  try {
    const raw = sessionStorage.getItem(`qdelay:${entryId}`);
    if (!raw) return false;
    const t = Number(raw);
    return Number.isFinite(t) && Date.now() - t < DELAY_BANNER_MS;
  } catch {
    return false;
  }
}

export { DELAY_BANNER_MS };
