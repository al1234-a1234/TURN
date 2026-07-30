"use client";

/**
 * تخزين محلّي خفيف للضيف (بلا حساب).
 * «دور» يعمل بلا تسجيل دخول للعميل، فنحفظ المفضّلة وسجلّ الزيارات في المتصفّح.
 * كل الدوال آمنة على الخادم (SSR): تعيد قيمًا فارغة إذا لم يوجد window.
 */

export type FavRestaurant = { slug: string; name: string; logo?: string | null };
export type TurnRecord = {
  slug: string; name: string; logo?: string | null; at: string;
  /** استرجاع التذكرة بعد إغلاق الصفحة — بدونهما كان الضيف يفقد دوره بمجرد الريلود */
  entryId?: string; phone?: string;
};

const FAV_KEY = "turn:favorites";
const TURNS_KEY = "turn:turns";

function read<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, val: T[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(val));
    window.dispatchEvent(new Event("turn:store"));
  } catch {
    /* تجاهل امتلاء التخزين */
  }
}

// ————— المفضّلة —————
export function getFavorites(): FavRestaurant[] {
  return read<FavRestaurant>(FAV_KEY);
}
export function isFavorite(slug: string): boolean {
  return getFavorites().some((f) => f.slug === slug);
}
export function toggleFavorite(fav: FavRestaurant): boolean {
  const list = getFavorites();
  const idx = list.findIndex((f) => f.slug === fav.slug);
  if (idx >= 0) {
    list.splice(idx, 1);
    write(FAV_KEY, list);
    return false;
  }
  list.unshift(fav);
  write(FAV_KEY, list.slice(0, 100));
  return true;
}

// ————— سجلّ الأدوار/الزيارات —————
export function getTurns(): TurnRecord[] {
  return read<TurnRecord>(TURNS_KEY);
}
/** يسجّل دورًا جديدًا (عند الانضمام للطابور). يتفادى التكرار المتتابع لنفس المطعم في نفس اليوم. */
export function recordTurn(rec: TurnRecord) {
  const list = getTurns();
  const day = rec.at.slice(0, 10);
  if (list[0] && list[0].slug === rec.slug && list[0].at.slice(0, 10) === day) {
    // نفس المطعم نفس اليوم: حدّث بيانات الاسترجاع بدل التجاهل
    if (rec.entryId) { list[0].entryId = rec.entryId; list[0].phone = rec.phone; write(TURNS_KEY, list); }
    return;
  }
  list.unshift(rec);
  write(TURNS_KEY, list.slice(0, 200));
}

/** ينسى بيانات استرجاع دور انتهى — وإلا علق العميل على شاشة نهائية بلا مخرج. */
export function clearTurnRecovery(slug: string) {
  const list = getTurns();
  let touched = false;
  for (const t of list) {
    if (t.slug === slug && t.entryId) { delete t.entryId; delete t.phone; touched = true; }
  }
  if (touched) write(TURNS_KEY, list);
}

/** يوم الرياض للطابع الزمني — حدود اليوم عندنا رياضية لا UTC. */
function riyadhDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
}

/** آخر دور محفوظ لمطعم بعينه اليوم (للاسترجاع بعد الريلود). */
export function lastTurnFor(slug: string): TurnRecord | null {
  const today = riyadhDay(new Date().toISOString());
  const rec = getTurns().find((t) => t.slug === slug && riyadhDay(t.at) === today && t.entryId);
  return rec ?? null;
}
