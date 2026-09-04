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
