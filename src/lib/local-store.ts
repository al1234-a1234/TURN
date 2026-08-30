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

/**
 * بيانات العميل لتعبئة النموذج — كانت تُقرأ من القاعدة على الخادم للمسجَّلين
 * وحدهم، وثمنها كان توليد الصفحة عند كل طلب. هنا تعمل للضيف أيضًا، وهو
 * الغالبية العظمى، وبلا أي رحلة شبكة.
 */
export type Me = { name?: string; phone?: string };
const ME_KEY = "turn:me";

export function getMe(): Me {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(ME_KEY) ?? "{}") as Me;
  } catch {
    return {};
  }
}

export function saveMe(me: Me) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ME_KEY, JSON.stringify({ ...getMe(), ...me }));
  } catch {
    // التخزين ممتلئ أو محظور — التعبئة رفاهية، لا تُفشل الانضمام
  }
}

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

// ————— سجلّ الحجوزات —————
//
// أُضيف لأنّ الاستعلام بالرقم لم يعد يُرجع هويّة مكانٍ ولا معرّفًا (0104):
// كان `/me` يبني قائمة حجوزاتك من ذلك الاستعلام، فلمّا سُحب منه المعرّف
// ماتت قدرة الإلغاء عند **كل** عميل لا عند صاحب الجهاز الجديد وحده.
//
// والباب الصحيح لاستعادتها ليس إعادة المعرّف إلى الاستعلام — فمن يملكه
// يفتح `/t/<id>` فيعرف المطعم، وهو التسريب نفسه بخطوة — بل أن يتذكّر
// **جهازُك** حجزك كما يتذكّر دورك. فالنظام لا يخبرك أين أنت؛ جهازك يعرف.
export type BookingRecord = {
  id: string; slug: string; name: string; at: string; phone?: string;
};
const BOOKINGS_KEY = "turn:bookings";

export function getBookings(): BookingRecord[] {
  return read<BookingRecord>(BOOKINGS_KEY);
}

export function recordBooking(rec: BookingRecord) {
  const list = getBookings().filter((b) => b.id !== rec.id);
  list.unshift(rec);
  write(BOOKINGS_KEY, list.slice(0, 50));
}

/** يُنسى فور الإلغاء أو انقضاء الموعد — قائمةٌ تعرض حجزًا ملغى تُضلّل صاحبها. */
export function clearBooking(id: string) {
  const list = getBookings();
  const next = list.filter((b) => b.id !== id);
  if (next.length !== list.length) write(BOOKINGS_KEY, next);
}

/**
 * عمر الدور الذي نعدّه حيًّا — نفس نافذة `expire_stale_waitlist` في القاعدة
 * (٨ ساعات). لا «يوم تقويميّ»: من انضمّ ١١:٥٠ مساءً ثمّ حدّث الصفحة ١٢:٠٥
 * كان يفقد تذكرته على جهازه بينما دورُه ما زال قائمًا في الطابور — الجلسة
 * واحدة والساعة عبرت منتصف الليل وحدها. اليوم التشغيليّ لا التقويميّ.
 */
const TURN_TTL_MS = 8 * 3600_000;

/** آخر دور محفوظ لمطعم بعينه في الجلسة الجارية (للاسترجاع بعد الريلود). */
export function lastTurnFor(slug: string): TurnRecord | null {
  const now = Date.now();
  const rec = getTurns().find(
    (t) => t.slug === slug && t.entryId && now - new Date(t.at).getTime() < TURN_TTL_MS,
  );
  return rec ?? null;
}
