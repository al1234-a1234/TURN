"use client";

/**
 * تخزين محلّي خفيف للضيف (بلا حساب).
 * «دور» يعمل بلا تسجيل دخول للعميل، فنحفظ المفضّلة وسجلّ الزيارات في المتصفّح.
 * كل الدوال آمنة على الخادم (SSR): تعيد قيمًا فارغة إذا لم يوجد window.
 */

export type FavRestaurant = { slug: string; name: string; logo?: string | null };
export type TurnRecord = { slug: string; name: string; logo?: string | null; at: string };

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
  if (list[0] && list[0].slug === rec.slug && list[0].at.slice(0, 10) === day) return;
  list.unshift(rec);
  write(TURNS_KEY, list.slice(0, 200));
}
