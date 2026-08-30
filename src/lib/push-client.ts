"use client";

/** تحويل مفتاح VAPID العام (base64url) إلى Uint8Array كما يطلبه المتصفّح. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export type PushSupport = "ready" | "needs-install" | "unsupported" | "no-key";

/**
 * ── العطب الذي يعالجه هذا القسم ──
 * كان الاشتراك القائم يُعاد استعماله **بلا مقارنة مفتاحه بالمفتاح الحاليّ**.
 * فجهازٌ اشترك بمفتاح VAPID قديم يظلّ يعطينا نقطته القديمة، ونحن نوقّع
 * بالجديد، فترفض آبل بـ`400 VapidPkHashMismatch` — اثنا عشر رفضًا متتاليًا
 * في الإنتاج بين ٢٧ و٢٩ أغسطس، والشاشة تقول «التنبيه مفعّل».
 *
 * ودورةٌ مغلقةٌ كانت تُبقيه حيًّا للأبد: المتصفّح يجد اشتراكًا فلا يُنشئ
 * جديدًا، وآبل ترجع `400` لا `410` فلا يُحذف الصفّ — والحذف وحده هو ما كان
 * سيدفع الجهاز إلى اشتراكٍ سليم. تُكسر الدورة من طرفيها: هنا وفي `push.ts`.
 */
function currentKeyBytes(): Uint8Array | null {
  const k = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!k) return null;
  try {
    return urlBase64ToUint8Array(k);
  } catch {
    return null;
  }
}

function sameKey(got: ArrayBuffer | null, want: Uint8Array): boolean {
  if (!got) return false; // null = اشتراكٌ بلا مفتاح خادمٍ أصلًا ⇒ لا يصلح
  const v = new Uint8Array(got);
  if (v.length !== want.length) return false;
  for (let i = 0; i < v.length; i += 1) if (v[i] !== want[i]) return false;
  return true;
}

/**
 * يعيد الاشتراك القائم إن كان مفتاحه هو الحاليّ، وإلا **يفسخه ويعيد null**.
 *
 * ولا يفسخ عند الشكّ: متصفّحٌ لا يكشف `options.applicationServerKey` أصلًا
 * (تُرجع `undefined` لا `null`) لا نحكم عليه — فسخُ اشتراكٍ سليمٍ لأنّنا
 * عاجزون عن قراءته خسارةٌ محقّقةٌ ثمنًا لشكٍّ لا دليل عليه.
 */
async function usableSubscription(
  reg: ServiceWorkerRegistration,
): Promise<PushSubscription | null> {
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return null;

  const want = currentKeyBytes();
  if (!want) return sub;

  const got = sub.options?.applicationServerKey;
  if (got === undefined) return sub; // المتصفّح لا يكشفه — نُبقيه
  if (sameKey(got, want)) return sub;

  try {
    await sub.unsubscribe();
  } catch {
    /* تعذّر الفسخ: نعيد null على أيّ حال فيُنشَأ اشتراكٌ جديد يحلّ محلّه */
  }
  return null;
}

/**
 * أضاف الزائر الموقع إلى شاشته الرئيسية ويفتحه من الأيقونة؟
 * (`standalone` خاصّة سفاري القديمة، و`display-mode` المعيار الحديث)
 */
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** آيفون أو آيباد — وآيباد الحديث يتنكّر في هيئة ماك، فيُكشف باللمس. */
function isApplePhone(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

/** هل يدعم هذا المتصفّح إشعارات الدفع، وهل المفتاح العام موجود؟ */
export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    // آبل لا تعطي `PushManager` لصفحةٍ في تبويب سفاري — تعطيها فقط لموقعٍ
    // أُضيف إلى الشاشة الرئيسية ويُفتح من أيقونته. فالنقص هنا ليس عجز جهاز
    // بل خطوةٌ لم تُطلَب من العميل بعد، والفرق بينهما هو الفرق بين رسالةٍ
    // تقول «متصفّحك لا يدعم» — فيغلق — وبين خطوتين يتّبعهما فيصله التنبيه.
    if (isApplePhone() && !isStandalone()) return "needs-install";
    return "unsupported";
  }
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return "no-key";
  return "ready";
}

/**
 * يسجّل الـService Worker، يطلب الإذن، ثم يشترك في الدفع.
 * يعيد بيانات الاشتراك لحفظها على الخادم، أو null إن رُفض/تعذّر.
 */
export async function subscribeToPush(): Promise<
  { endpoint: string; p256dh: string; auth: string } | null
> {
  if (pushSupport() !== "ready") return null;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;

    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;

    // أعد استخدام اشتراك قائم **إن كان مفتاحه هو الحاليّ**، وإلا أنشئ واحدًا
    let sub = await usableSubscription(reg);
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string),
      });
    }

    return toParts(sub);
  } catch {
    return null;
  }
}

function toParts(
  sub: PushSubscription,
): { endpoint: string; p256dh: string; auth: string } | null {
  const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) return null;
  return { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth };
}

/**
 * اشتراكُ هذا الجهاز الآن — لإعادة ربطه بصاحب الدور الحاليّ.
 *
 * يُستدعى فقط والإذن ممنوحٌ سلفًا، فلا يُظهر أيّ نافذة طلب. وإن كان القائم
 * مسمومًا بمفتاحٍ قديم فُسخ وأُنشئ محلَّه واحدٌ سليم — وهنا يقع الشفاء
 * الذاتيّ: يتعافى الجهاز في أوّل جلسةٍ يفتح فيها تذكرته، بلا أن يُطلب من
 * صاحبه شيء. ولولا هذا لبقي «مفعّلًا» صامتًا إلى الأبد.
 */
export async function activePushSubscription(): Promise<
  { endpoint: string; p256dh: string; auth: string } | null
> {
  if (pushSupport() !== "ready") return null;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return null;

  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return null;

    let sub = await usableSubscription(reg);
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
        ),
      });
    }
    return toParts(sub);
  } catch {
    return null;
  }
}
