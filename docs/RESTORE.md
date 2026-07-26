# استرجاع «دور» من الصفر — دليل الاستقلال الكامل

> الغاية: لو اختفى كل شيء غدًا — Supabase أُغلق، Vercel علّق الحساب، الجهاز
> ضاع — تعود المنصّة للعمل خلال ساعات من **نسخة احتياطية + هذا المستودع** فقط.
> لا تعتمد على ذاكرة أحد ولا على دعم أي شركة.

---

## ما الذي تملكه أنت (وأين هو)

| الأصل | مكانه | من يحتاجه |
|---|---|---|
| الكود كاملًا | هذا المستودع (GitHub، عامّ) | أي استضافة Next.js |
| بنية القاعدة كاملة | `supabase/migrations/0001…` بالترتيب | أي Postgres 15+ |
| بيانات الإنتاج | نسخ `scripts/backup.sh` (عندك، ليست في المستودع) | — |
| حسابات الدخول | `03-data-auth.sql.gz` من النسخة (سرّي) | — |
| فحوص السلامة | `supabase/tests/critical_checks.sql` | بعد أي استرجاع |
| مفاتيح الدفع VAPID | العام في `.env.production`، **الخاص في Vercel فقط** | الإشعارات |

> **أهم عادة**: شغّل `./scripts/backup.sh` أسبوعيًّا (أو قبل أي تغيير كبير)
> واحفظ الناتج في مكانين (جهازك + قرص خارجي أو تخزين سحابي خاص مشفَّر).

---

## السيناريو ١ — الاسترجاع إلى مشروع Supabase جديد (الأسرع)

مناسب لو تعطّل مشروعك الحالي أو أردت نقل المنطقة.

1. أنشئ مشروعًا جديدًا على supabase.com (أي منطقة). خذ منه:
   - `Project URL` و `anon key` (Settings → API)
   - رابط الاتصال المباشر (Settings → Database → URI)
2. طبّق البنية — إمّا الترحيلات بالترتيب (الأنظف):
   ```bash
   for f in supabase/migrations/*.sql; do
     psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -f "$f"
   done
   ```
   أو لقطة البنية من النسخة الاحتياطية:
   ```bash
   gunzip -c backups/<STAMP>/01-schema.sql.gz | psql "$NEW_DB_URL" -v ON_ERROR_STOP=1
   ```
3. أعد البيانات ثم الحسابات (**الترتيب مهم**):
   ```bash
   gunzip -c backups/<STAMP>/02-data-public.sql.gz | psql "$NEW_DB_URL" -v ON_ERROR_STOP=1
   gunzip -c backups/<STAMP>/03-data-auth.sql.gz  | psql "$NEW_DB_URL" -v ON_ERROR_STOP=1
   ```
4. انشر دالة الموظفين (إنشاء حسابات الاستقبال):
   ```bash
   npx supabase functions deploy provision-staff --project-ref <REF_الجديد>
   ```
   (الكود في `supabase/functions/provision-staff/index.ts`.)
5. أعد جدولة المهام الليلية (pg_cron) — هذه هي جدولة الإنتاج الفعلية
   (مأخوذة من `cron.job` بتاريخ 2026-07-26، والتوقيتات UTC):
   ```sql
   select cron.schedule('rollup-daily',  '10 0 * * *', $$SELECT public.rollup_all_daily_stats((current_date - 1))$$);
   select cron.schedule('daily-digest',  '20 0 * * *', $$SELECT public.run_daily_digest()$$);
   select cron.schedule('slow-hours',    '0 * * * *',  $$SELECT public.run_slow_hours()$$);
   select cron.schedule('auto_winback',  '0 2 * * *',  $$select public.run_auto_winback()$$);
   select cron.schedule('weekly_digest', '30 2 * * 0', $$select public.run_weekly_digest()$$);
   ```
   (تحقّق دوريًّا بـ `select * from cron.job;` واحفظ الناتج مع كل نسخة احتياطية.)
6. حدّث متغيّرات البيئة في الاستضافة (انظر الجدول أدناه) وأعد النشر.
7. **شغّل شبكة الفحوص**: نفّذ `supabase/tests/critical_checks.sql` كاملًا —
   كل الصفوف يجب أن تكون `pass = true`. أي `false` = لا تفتح المنصّة للناس.

## السيناريو ٢ — بلا Supabase إطلاقًا (Postgres ذاتيّ الاستضافة)

المنصّة لا تستخدم من Supabase إلا: Postgres + GoTrue (الدخول) + PostgREST
(واجهة الجداول) + دالة Edge واحدة. كلها مفتوحة المصدر:

1. شغّل حزمة Supabase المفتوحة كاملة بـ Docker (تجمع الأربعة):
   ```bash
   git clone https://github.com/supabase/supabase
   cd supabase/docker && cp .env.example .env   # عدّل الأسرار
   docker compose up -d
   ```
2. طبّق الخطوات 2–3 من السيناريو ١ على قاعدة الحاوية.
3. وجّه `NEXT_PUBLIC_SUPABASE_URL` إلى عنوان خادمك، وولّد `anon key`
   بحسب توثيق الحزمة (JWT بسرّك أنت).
4. دالة `provision-staff` تعمل على أي Deno — أو تستبدلها بمسار API داخل
   Next.js إن أردت الاستغناء عن Edge كليًّا.

## السيناريو ٣ — استضافة الواجهة بعيدًا عن Vercel

المشروع Next.js قياسي بلا أي ميزة خاصة بـ Vercel:

```bash
npm ci && npm run build && npm run start   # يعمل على أي VPS
```

أو أي منصّة تدعم Next.js (Netlify، Railway، Render، Coolify على خادمك…).
اضبط متغيّرات البيئة نفسها وأعد توليد روابط QR إن تغيّر النطاق —
**ولهذا السبب اربط نطاقًا خاصًّا قبل طباعة الملصقات**، فيبقى الرابط ثابتًا
مهما تغيّرت الاستضافة.

---

## متغيّرات البيئة (كل ما يحتاجه البناء)

| المتغيّر | سرّي؟ | من أين |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | لا | مشروع Supabase → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | لا | مشروع Supabase → API |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | لا | موجود في `.env.production` |
| `VAPID_PRIVATE_KEY` | **نعم** | من مولّد المفاتيح — أنشئ زوجًا جديدًا عند الضياع: `npx web-push generate-vapid-keys` (يُبطل اشتراكات الدفع القديمة فقط؛ يعيد العملاء تفعيلها بضغطة) |
| `VAPID_SUBJECT` | لا | `mailto:` بريدك (اختياري) |

## تسلسل تجربة استرجاع (تمرين نصف سنوي)

1. `./scripts/backup.sh` على الإنتاج.
2. استرجع إلى مشروع Supabase مجاني مؤقت (السيناريو ١).
3. شغّل `critical_checks.sql` — كلها `pass`.
4. `npm run dev` موجّهًا للمشروع المؤقت: سجّل دخول استقبال، خذ دورًا كضيف،
   أجلسه، تأكّد أن الطابور يتحرّك.
5. احذف المشروع المؤقت. سجّل تاريخ التمرين هنا:

| التاريخ | النتيجة | ملاحظات |
|---|---|---|
| — | — | أول تمرين لم يُنفَّذ بعد |
