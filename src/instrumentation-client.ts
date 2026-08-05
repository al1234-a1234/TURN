import * as Sentry from "@sentry/nextjs";
import { SENTRY_DSN, SENTRY_ENABLED, SENTRY_ENV, SENTRY_RELEASE, IGNORE_ERRORS, scrubEvent } from "@/lib/sentry-shared";

/**
 * تهيئة Sentry في متصفّح الزبون.
 *
 * هذه أهمّ بيئة عندنا: أعطال الزبون هي التي لا تصل أبدًا. صاحب المطعم يتّصل
 * ليشتكي، أمّا الزبون الواقف على الباب فيغادر صامتًا ولا يخبر أحدًا. Sentry
 * هنا هو الطريقة الوحيدة لسماع صوته.
 */
if (SENTRY_ENABLED) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENV,
    release: SENTRY_RELEASE,
    sendDefaultPii: false,
    ignoreErrors: IGNORE_ERRORS,
    sampleRate: 1.0,
    tracesSampleRate: 0.1,
    integrations: [
      // يلتقط console.error/warn من مكوّنات العميل — ومنها تذكرة الطابور
      // والهدايا، وهي مواضع كانت تبتلع أخطاءها بصمت.
      Sentry.captureConsoleIntegration({ levels: ["error", "warn"] }),
      Sentry.extraErrorDataIntegration({ depth: 5 }),
      // قياس زمن التنقّل والطلبات: البطء داخل مطعمٍ مزدحم عطلٌ حقيقي وإن لم يرمِ
      Sentry.browserTracingIntegration(),
    ],
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
  });
}

/** يربط زمن التنقّل بين الصفحات بقياسات Sentry (مطلوب في App Router). */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
