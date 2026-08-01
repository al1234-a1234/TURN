/* إيت / EIGHT — Service Worker لإشعارات الدفع (Web Push).
   يصل الإشعار والتطبيق مُغلق تمامًا. لا يخزّن شيئًا ولا يعترض الطلبات. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "إيت", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "إيت";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.tag || "turn-queue",
    // نفس الـtag ⇒ يُستبدل الإشعار في مكانه بدل التكدّس.
    // الصامت: يحدّث الرقم بلا تنبيه/اهتزاز (لمن دوره بعيد).
    renotify: payload.silent !== true,
    silent: payload.silent === true,
    dir: "rtl",
    lang: payload.lang || "ar",
    vibrate: payload.silent === true ? undefined : [120, 60, 120],
    requireInteraction: payload.requireInteraction === true,
    data: { url: payload.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      // إن كان التطبيق مفتوحًا: ركّز عليه وانتقل للمسار
      for (const client of list) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) client.navigate(target).catch(() => {});
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    }),
  );
});
