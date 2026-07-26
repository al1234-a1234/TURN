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

## عزل الفروع (الفرانشايز)

الفرع وحدة مستقلّة تمامًا في القاعدة، لا في واجهة التطبيق فقط. المسند الوحيد
هو `can_access_branch(b_id)` (migration 0035):

| الحساب | ما يراه |
|---|---|
| `is_platform_admin()` | كل شيء |
| موظّف بلا `branch_id` (مالك العلامة) | كل فروع مطعمه |
| موظّف مربوط بـ`branch_id` (فرانشايز) | فرعه فقط |

مفروض على: الطابور، الحجوزات، الطاولات، إعدادات الفرع، التنبيهات، الإحصاءات
اليومية، القائمة، العروض، الصور، المسح وإعداداته، التقييمات، استهلاك العروض،
الفريق، وجدول `branches` نفسه (0035–0038).

ودوال `SECURITY DEFINER` تتجاوز RLS فتفحص الفرع بنفسها: `queue_push_targets`،
`set_staff_permission`، `staff_can_read_customer` (0037).

**ما يبقى على مستوى العلامة عمدًا**: `customer_restaurant` و`customer_rewards`
و`loyalty_programs` — ولاء العميل ملك العلامة لا الفرع، ونقاطه لازم تشتغل في
أي فرع. لكن جدول `customers` نفسه محروس بـ`staff_can_read_customer`، فمن لم
يزر فرعك لا يظهر لك. لذلك **كل استعلام على `customer_restaurant` في اللوحة
يستخدم `customers!inner(...)`** — بلا `!inner` تعود صفوف العلامة كلها بأسماء
فارغة، فتختلط أرقام الفرع بأرقام العلامة.

**ما يقتصر على مالك العلامة** (`is_brand_manager` — موظّف بلا `branch_id`):
تعديل `restaurants` (الاسم/الشعار/الروابط)، فتح فرع أو حذفه، قراءة
`owner_insights` (مولَّدة بتجميع كل الفروع)، وحملات الهدايا تُقصَر تلقائيًّا
على عملاء فرع المتصل داخل `grant_reward_to_segment` (0039).

ودالة `provision-staff` (Edge) تعمل بمفتاح الخدمة فتتجاوز RLS: تفحص الفرع
بنفسها — مدير فرع لا ينشئ حسابًا لفرع آخر ولا حسابًا بلا فرع.

> العزل السابق كان في طبقة الاستعلام (`scopeBranchIds`) — حاجز شكلي: نداء
> مباشر على PostgREST كان يتخطّاه. أي جدول جديد يحمل `branch_id` **يجب** أن
> تمرّ سياسته عبر `can_access_branch`، وفحص `branch_rls_everywhere` يمنع النسيان.

## الاختبارات

- **وحدات (منطق حرج)**: `npm test` — تطبيع الأرقام وتوقيت الرياض (٩ فحوص).
- **قاعدة البيانات**: `supabase/tests/critical_checks.sql` — ٣٨ فحصًا (صلاحيات،
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
