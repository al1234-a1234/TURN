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

## أوامر التطوير

```bash
npm run dev     # تشغيل بيئة التطوير
npm run build   # بناء الإنتاج
npm run lint    # فحص ESLint
```
