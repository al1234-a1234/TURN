# مرجع المخطط المثبَّت (Schema Baseline)

**التُقطت من الإنتاج — مشروع `nkdfxmjuigslmangzuua`.**

## لماذا هذا الملف موجود

اكتُشف في تدقيق العشرين سؤالًا أن **سجلّ الهجرات في الإنتاج (١٠٥ هجرة) لا يطابق ملفات
المستودع (٧٢ ملفًّا)**، وأن أسماءهما لا تتقابل: الإنتاج يسجّل بطابع زمني واسمٍ حرّ
(`reception_armed_gifts_and_hardening`) بينما الملفات مرقّمة (`0068_..._perm_cleanup.sql`).

نتيجة ذلك أن الجملة «أعِد البناء من الملفات تحصل على الإنتاج» **غير مُثبَتة** — وهي
الجملة التي يقوم عليها دليل الاستعادة من الصفر. فما دام لا يمكن إثباتها بإعادة بناءٍ
كامل، نثبّت **البصمة** بدلًا منها: أرقامٌ يقيسها الفحص اليومي، فأي انحراف يظهر في
اليوم التالي لا بعد الكارثة.

## البصمة

| العنصر | العدد |
|---|---|
| الجداول (`public`, relkind='r') | **٢٩** |
| الدوال (`public`, prokind='f') | **١٠١** |
| سياسات RLS (`public`) | **٧٢** |
| الفهارس (`public`) | ٩٤ |
| المفاتيح الأجنبية (`public`) | **٤٠** |
| المشغّلات (غير الداخلية) | ٢٩ |
| وظائف الكرون | ٧ |
| دوال `SECURITY DEFINER` متاحة لـ `anon` | ٢١ |

الأربعة المعلَّمة بالخط العريض يفحصها `q20_schema_no_drift` في
`supabase/tests/critical_checks.sql`. والخامس يفحصه `q05_secdef_anon_surface`
كحدٍّ أعلى (٣٠) — فأي دالة جديدة تُكشف للضيف تُسقط الفحص. والواقع اليوم ٢١،
أي أنّ تحته متّسعًا مقصودًا لا فجوة.

آخر تحديثٍ للبصمة: **0106** (الموجة الثانية). ما غيّرها:
`0105` سحب سياسة إدخال التقييمات (‑١ سياسة) وأضاف فهرسًا فريدًا؛
`0106` أضاف ثلاث دوال (`my_branch_ids_for`، `my_managed_branch_ids`،
`audit_row_delete`) وستّ سياسات بدل اثنتين على الطابور والحجوزات
(+٦ ‑٢) ومُشغِّلَي تدوينٍ للحذف (+٢).

## كيف تُحدَّث هذه البصمة

الانحراف ليس خطأً دائمًا: إضافة جدول أو سياسة عن قصد تُغيّر الأرقام. القاعدة:

1. طبّق تغييرك عبر ملف هجرة مرقّم في `supabase/migrations/` **وطبّقه على الإنتاج**.
2. أعِد قياس البصمة (الاستعلام أسفله).
3. حدّث الأرقام هنا **وفي `q20`** في نفس الـcommit الذي أحدث التغيير.

الخطوة الثالثة هي المقصودة: تحديث البصمة يصير **قرارًا مكتوبًا في التاريخ**، لا شيئًا
يحدث صامتًا. وإن سقط `q20` بلا commit يفسّره، فهناك تغييرٌ لم يمرّ من المستودع — وهذا
بالضبط ما نريد أن نعرفه.

## استعلام إعادة القياس

```sql
select
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r') as tables,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f') as functions,
  (select count(*) from pg_policies where schemaname='public') as policies,
  (select count(*) from pg_indexes where schemaname='public') as indexes,
  (select count(*) from pg_constraint c join pg_class r on r.oid=c.conrelid
    join pg_namespace n on n.oid=r.relnamespace
    where n.nspname='public' and c.contype='f') as fkeys,
  (select count(*) from pg_trigger t join pg_class r on r.oid=t.tgrelid
    join pg_namespace n on n.oid=r.relnamespace
    where n.nspname='public' and not t.tgisinternal) as triggers,
  (select count(*) from cron.job) as cron_jobs,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f' and p.prosecdef
      and has_function_privilege('anon',p.oid,'EXECUTE')) as secdef_anon;
```

## حدّ هذه الطريقة — بصراحة

البصمة تكشف **الإضافة والحذف**، ولا تكشف **التعديل في المحتوى**: دالة يتغيّر جسدها
بلا تغيّر عددها تمرّ من `q20`. ولهذا تُوجد فحوص المحتوى المستقلّة إلى جانبها —
`q12`–`q17` تفحص أجساد الدوال الحسّاسة نصًّا (فحص `is_active`، سقف الازدحام، قصّ
المدخلات)، و`q01`–`q03` تفحص الصلاحيات. المجموع شبكة تكشف أكثر ما يهمّ، لا كل شيء.

التغطية الكاملة تحتاج مقارنة مخطّطٍ حقيقية (بناء قاعدة نظيفة من الملفات ثم `diff`)
داخل CI — وهي الخطوة التالية الطبيعية متى أردناها.

## تحديث ٩ أغسطس ٢٠٢٦ — لماذا تحرّكت الأرقام

الانحراف مقصودٌ كلّه، ومصدره ترحيلات ليلة التحصين 0092–0098:

| العنصر | كان | صار | السبب |
|---|---|---|---|
| جداول | ٢٤ | ٢٧ | `platform_status` · `admin_audit` · (وجدولٌ سابق) |
| دوال | ٧٤ | ٩٣ | مقود الطوارئ · `admin_restaurants_list` · `service_role_probe` · حرّاس |
| سياسات | ٦١ | ٦٧ | قراءة حالة المنصّة · قراءة سجلّ التدقيق للمالك ولمدير المنصّة |
| فهارس | ٨٤ | ٨٩ | فهرسا التدقيق · فهرس الكناري (+ حذف ثلاثة من الطابور) |
| مفاتيح أجنبية | ٣٩ | ٤٠ | — |
| مُطلِقات | ١٥ | ٢٧ | أسقف الفرع والحجز · تقييس الرقم · مفتاح الإيقاف · حصانة السجلّ |

**والقاعدة التي لا تُخالَف:** لا يُحدَّث هذا الملفّ ليَسكت فحصٌ أحمر. يُحدَّث
حين يكون الانحراف قرارًا مكتوبًا في ترحيلٍ مُراجَع — وإلّا فالأحمر صادق،
والملفّ هو الكاذب.
