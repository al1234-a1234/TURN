import * as Sentry from "@sentry/nextjs";
import { SENTRY_DSN, SENTRY_ENABLED, SENTRY_ENV, SENTRY_RELEASE, IGNORE_ERRORS, scrubEvent } from "@/lib/sentry-shared";

/**
 * تهيئة Sentry على الخادم وحافة الشبكة.
 *
 * تُستدعى مرّة عند إقلاع كل بيئة تشغيل، فتغطّي: مكوّنات الخادم، وأفعال
 * "use server"، ومعالجات المسارات، والوسيط — أي كل ما يجري خارج المتصفّح.
 */
export async function register() {
  if (!SENTRY_ENABLED) return;

  const common = {
    dsn: SENTRY_DSN,
    environment: SENTRY_ENV,
    release: SENTRY_RELEASE,
    // لا كوكيز ولا ترويسات تصريح ولا عناوين IP — الهوية هنا رقم جوّال، وإرساله
    // إلى خدمة خارجية مخالفةٌ للنظام. والمنقّي يُمسك ما قد يتسرّب في نصّ الخطأ.
    sendDefaultPii: false,
    ignoreErrors: IGNORE_ERRORS,
    // كل خطأ يُرسَل (لا نُفوّت شيئًا)، أمّا قياس الأداء فعيّنة تكفي لكشف البطء
    sampleRate: 1.0,
    tracesSampleRate: 0.1,
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
  };

  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      ...common,
      integrations: [
        // القطعة الأهمّ: ~١٧٠ موضعًا تكتب console.error بعد إصلاح «الأخطاء
        // المبتلَعة». بدون هذا تبقى مكتوبةً في سجلّ لا يفتحه أحد. و warn معها
        // عمدًا — «الإشعارات غير مهيّأة» تحذيرٌ يعني أن أهمّ وعودنا معطّل بصمت.
        Sentry.captureConsoleIntegration({ levels: ["error", "warn"] }),
        // تفاصيل الخطأ غير القياسية (مثل تفاصيل خطأ Supabase) بدل رسالة مجرّدة
        Sentry.extraErrorDataIntegration({ depth: 5 }),
      ],
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      ...common,
      integrations: [Sentry.captureConsoleIntegration({ levels: ["error", "warn"] })],
    });
  }
}

/**
 * أخطاء مكوّنات الخادم وأفعالها — Next يمرّرها هنا، وبدون هذا الخطّاف تختفي
 * كثيرٌ منها من التقارير رغم أن المستخدم رأى شاشة خطأ.
 */
export const onRequestError = Sentry.captureRequestError;
