# دور / Turn — دليل المشروع

منصة حجوزات وقوائم انتظار للمطاعم. عربية بالكامل مع دعم RTL.

## التقنيات

- **Next.js 15** (App Router) + **TypeScript**
- **Tailwind CSS v4** (إعداد عبر CSS في `src/app/globals.css`)
- **Supabase** (قاعدة بيانات Postgres + Auth) — عملاء عبر `@supabase/ssr`
- الخطوط: **Tajawal** (الواجهة) و **Almarai** (العناوين) عبر `next/font/google`
- اتجاه الصفحة **RTL** واللغة `ar` (مضبوطة في `src/app/layout.tsx`)

## البنية

- `src/app/` — صفحات ومسارات App Router
- `src/lib/supabase/client.ts` — عميل Supabase للمتصفح (Client Components)
- `src/lib/supabase/server.ts` — عميل Supabase للخادم (Server Components / Actions)
- `.env.local` — أسرار محلية (غير مُتتبَّعة في git)؛ القالب في `.env.example`

## Supabase

- المشروع: **Turn** — منطقة فرانكفورت (`eu-central-1`)، ref: `nkdfxmjuigslmangzuua`
- متغيّرات البيئة المطلوبة: `NEXT_PUBLIC_SUPABASE_URL`، `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### ملاحظة مهمة حول جدول `reservations`

عمود `time_range` من نوع `tstzrange` **عادي** (وليس `GENERATED`)، ويُملأ عبر
**trigger** قبل الإدخال والتحديث (`BEFORE INSERT OR UPDATE`). السبب: استخدام
عمود مُولّد مع دوال زمنية غير ثابتة (immutable) يسبب خطأ `42P17`
(generation expression is not immutable).

## إشعارات الدفع (Web Push)

تنبيه العميل بدوره يصل **والتطبيق مُغلق** عبر Service Worker + VAPID.

- `public/sw.js` — معالِجا `push` و `notificationclick` (لا يعترض الطلبات).
- `src/lib/push.ts` — الإرسال من الخادم؛ ينظّف الاشتراكات الميّتة (404/410).
- `src/lib/push-client.ts` — التسجيل والاشتراك في المتصفّح.
- الجدول `push_subscriptions` + دوال `save_push_subscription` /
  `push_subs_for_entry` / `delete_push_subscription` (migration 0017).
- يُرسَل من `updateWaitlistStatus`:
  - **لصاحب الصف** عند `notified` أو `seated`.
  - **تلقائيًّا لكل من تقدّم دوره** عند `seated`/`cancelled` عبر
    `queue_push_targets` (migration 0018) — بلا أي ضغطة إضافية من الاستقبال.
- ضدّ الإزعاج: كل الإشعارات بنفس الـ`tag` فتُستبدل في مكانها بدل التكدّس،
  والتنبيه الصوتي يعمل لأول ٣ فقط ومن بعدهم تحديث صامت (`silent`).

### متغيّرات البيئة

| المتغيّر | أين يُضبط |
|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | `.env.production` (عام، آمن للعلن) |
| `VAPID_PRIVATE_KEY` | **إعدادات Vercel فقط** — سرّ، لا يُكتب في git |
| `VAPID_SUBJECT` | اختياري (`mailto:`)، الافتراضي مضبوط في الكود |

> المستودع **عام**، فلا يجوز إطلاقًا وضع المفتاح الخاص في أي ملف متتبَّع.
> إن غاب المفتاح الخاص تتحوّل الإشعارات إلى «لا شيء» بهدوء ولا يتعطّل الطابور.

> iOS/Safari: لا يصل الدفع إلا بعد **إضافة التطبيق للشاشة الرئيسية**
> (Add to Home Screen) — قيد من آبل لا حيلة فيه.

## الاختبارات

- **وحدات (منطق حرج)**: `npm test` — تطبيع الأرقام وتوقيت الرياض (٩ فحوص).
- **قاعدة البيانات**: `supabase/tests/critical_checks.sql` — ٣٠ فحصًا (صلاحيات،
  حرّاس، فهارس، سلامة فصل الفروع، صحّة الترقيم الحيّ). يُنفَّذ على الإنتاج عبر
  Supabase MCP **بعد كل ترحيل** — أي `pass=false` يوقف النشر.
- أول تشغيل للشبكة كشف فعليًّا إقفالًا ناقصًا (منح PUBLIC يُورَّث لـ anon —
  أُصلح في 0030). لا تتجاوز فشلها أبدًا.

## أوامر التطوير

```bash
npm run dev     # تشغيل بيئة التطوير
npm run build   # بناء الإنتاج
npm run lint    # فحص ESLint
```
