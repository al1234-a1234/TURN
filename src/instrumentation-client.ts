import {
  SENTRY_DSN,
  SENTRY_ENABLED,
  SENTRY_ENV,
  SENTRY_RELEASE,
  IGNORE_ERRORS,
  scrubEvent,
} from "@/lib/sentry-shared";
import { initBotId } from "botid/client/core";

/**
 * حماية البوتات — الأفعال الثلاثة التي تكتب نيابةً عن ضيفٍ بلا حساب ولا
 * كلمة مرور: الانضمام للطابور، الحجز، وتأكيد الحضور من رابط التذكرة.
 * هذه أفعالٌ خادميّة (Server Actions) لا نقاط نهاية REST، فالمسار المحمي
 * هو مسار الصفحة نفسها (`/r/*`، `/t/*`) لا مسار الدالّة. مستوى الفحص هنا
 * يجب أن يطابق `checkLevel` في `checkBotId()` بجانب الخادم حرفيًّا.
 */
initBotId({
  protect: [
    { path: "/r/*", method: "POST", advancedOptions: { checkLevel: "deepAnalysis" } },
    { path: "/t/*", method: "POST", advancedOptions: { checkLevel: "deepAnalysis" } },
  ],
});

/**
 * تهيئة Sentry في متصفّح الزبون — **مؤجَّلة عن المسار الحرج**.
 *
 * هذه أهمّ بيئة عندنا: أعطال الزبون هي التي لا تصل أبدًا. صاحب المطعم يتّصل
 * ليشتكي، أمّا الزبون الواقف على الباب فيغادر صامتًا ولا يخبر أحدًا.
 *
 * لكن قياسًا فعليًّا للحزمة: استيراد Sentry استيرادًا ساكنًا يرفع جافاسكربت
 * المشتركة من ١٠٢ إلى ١٩١ كيلوبايت — أي يُضاعفها تقريبًا على **كل** فتحة صفحة،
 * وصفحة مسح الباركود من ١٩٧ إلى ٢٨١. وسرعة تلك الصفحة هي وعدنا الأول على باب
 * مطعمٍ مزدحم، فأداةٌ تراقب التجربة يجب ألّا تكون هي من يُفسدها.
 *
 * وجرّبتُ تقليم الإضافات أولًا (التتبّع وconsole) فوفّر كيلوبايتًا واحدًا: الثقل
 * في نواة الحزمة لا في أطرافها. فالعلاج المجدي الوحيد هو تأجيل التحميل.
 *
 * فصار:
 *   ١) مستمعان صغيران (بضع مئات البايتات) يلتقطان الأخطاء **من أول لحظة** —
 *      فلا تضيع أعطال الثواني الأولى، وهي أهمّها في الانطباع الأول.
 *   ٢) حزمة Sentry تُحمَّل عند خمول المتصفّح، في جزءٍ منفصل خارج الحمولة الأولى.
 *   ٣) ما التُقط في الأثناء يُرسَل فور جهوزها، موسومًا بـpre_init.
 *
 * وإن فشل التحميل (شبكة مقطوعة، حاجب إعلانات) لا يتعطّل شيء: لا مسار في
 * التطبيق يعتمد على Sentry.
 *
 * ملاحظتان على ما أُسقط عمدًا:
 *   • captureConsole: صفر من مكوّنات العميل الـ٥٤ تكتب console (تُحقق بالبحث)،
 *     فلم يكن يلتقط شيئًا من كودنا — بينما يلتقط تحذيرات React الداخلية، وخطأ
 *     ترطيبٍ واحد يكفي لاستنزاف حصّة الأخطاء الشهرية فيُسكِت ما يهمّ حقًّا.
 *     وهو باقٍ على الخادم حيث تعيش الـ٤٨ موضعًا الحقيقية.
 *   • browserTracing: قياس زمن التحميل بعد أن يكتمل التحميل بلا معنى.
 */

type Pending = { value: unknown; at: number };

if (SENTRY_ENABLED && typeof window !== "undefined") {
  /** ما وقع قبل جهوز Sentry — محدود العدد كي لا يتضخّم إن انهارت صفحة */
  const pending: Pending[] = [];
  const MAX_PENDING = 20;
  let ready = false;

  const onError = (ev: ErrorEvent) => {
    if (!ready && pending.length < MAX_PENDING) {
      pending.push({ value: ev.error ?? ev.message, at: Date.now() });
    }
  };
  const onRejection = (ev: PromiseRejectionEvent) => {
    if (!ready && pending.length < MAX_PENDING) {
      pending.push({ value: ev.reason, at: Date.now() });
    }
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  const boot = () => {
    void import("@sentry/nextjs")
      .then((Sentry) => {
        Sentry.init({
          dsn: SENTRY_DSN,
          environment: SENTRY_ENV,
          release: SENTRY_RELEASE,
          sendDefaultPii: false,
          ignoreErrors: IGNORE_ERRORS,
          sampleRate: 1.0,
          integrations: [
            // تفاصيل الأخطاء غير القياسية (مثل تفاصيل خطأ Supabase) بدل رسالة مجرّدة
            Sentry.extraErrorDataIntegration({ depth: 5 }),
          ],
          beforeSend: scrubEvent,
        });

        // Sentry ركّب مستمعيه داخل init، فنزيل مستمعينا بعده لا قبله كي لا تُفلت لحظة
        ready = true;
        window.removeEventListener("error", onError);
        window.removeEventListener("unhandledrejection", onRejection);

        for (const p of pending) {
          Sentry.captureException(p.value, {
            tags: { pre_init: "true" },
            extra: { captured_at: new Date(p.at).toISOString() },
          });
        }
        pending.length = 0;
      })
      .catch(() => {
        // تعذّر تحميل المراقبة ليس عطلًا في المنتج — نمضي بصمت
      });
  };

  // بعد أن تصير الصفحة قابلة للاستعمال؛ والمهلة تضمن التحميل حتى لو لم يخمل
  // المتصفّح. وSafari لا يدعم requestIdleCallback حتى اليوم — والمؤقّت بديله.
  const idle = (
    window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    }
  ).requestIdleCallback;

  if (typeof idle === "function") idle(boot, { timeout: 5000 });
  else setTimeout(boot, 2000);
}
