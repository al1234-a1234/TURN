"use client";

/** تحويل مفتاح VAPID العام (base64url) إلى Uint8Array كما يطلبه المتصفّح. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export type PushSupport = "ready" | "unsupported" | "no-key";

/** هل يدعم هذا المتصفّح إشعارات الدفع، وهل المفتاح العام موجود؟ */
export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
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

    // أعد استخدام اشتراك قائم إن وُجد، وإلا أنشئ واحدًا
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string),
      });
    }

    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null;

    return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth };
  } catch {
    return null;
  }
}
