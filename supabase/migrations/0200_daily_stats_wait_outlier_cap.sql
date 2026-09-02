-- ═══ ٠٢٠٠ — سقف الشواذ في avg_wait_seconds يطابق الشاشات الأربع ═══
--
-- خمسة مواضع في المنصّة تحسب «متوسّط الانتظار»، أربعةٌ منها تُسقط الشواذّ
-- بنفس الحدّ (٠ ≤ دقيقة < ٦٠٠) وواحدٌ لا يفعل:
--
--   dashboard/page.tsx:85-87          ٠ ≤ د < ٦٠٠
--   dashboard/manage/page.tsx:145-148 ٠ ≤ د < ٦٠٠
--   dashboard/reports/page.tsx:150-153 ٠ ≤ د < ٦٠٠
--   0176 تقرير تلغرام avg_wait_min    ٠ ≤ د < ٦٠٠
--   rollup_daily_stats.avg_wait_seconds  ← بلا حدٍّ إطلاقًا
--
-- فصفٌّ واحدٌ عمرُه ثلاثون ساعة (ضيفٌ نُسي مفتوحًا لليوم التالي) يدخل
-- المتوسّط كاملًا في الجدول ويُستبعَد في الأربعة. أي أنّ جدول الإحصاءات
-- اليوميّة قد يخالف كلّ شاشةٍ في المنصّة عن نفس اليوم.
--
-- ■ ما أثره اليوم على ما يراه المالك: **لا شيء**. وأقولها صراحةً كي لا
--   يُقرأ هذا الترحيل أكبر ممّا هو:
--     • لا قارئ لـavg_wait_seconds في src/ إطلاقًا (بحثٌ كامل).
--     • ولا دالّة في القاعدة تقرؤه (بحثٌ في pg_get_functiondef لكلّ الدوالّ).
--   فهو عمودٌ يُكتب ولا يُقرأ. وقيمته أنّ أوّل من يقرؤه غدًا لن يحصل على
--   رقمٍ يناقض الشاشات — لا أنّه يُصلح رقمًا معروضًا الآن.
--
-- ■ وهو يُكتب فعلًا لا نظريًّا: rollup_all_daily_stats تجري ليليًّا
--   (cron «rollup-daily» @ 10 21 * * * = ٠٠:١٠ بتوقيت الرياض)، والجدول
--   فيه ٨٥ صفًّا آخرها ٢٠٢٦-٠٩-٠١، وأعلى قيمةٍ مسجَّلة ١٠٧٤٢ث = ١٧٩ دقيقة
--   — أي فوق ما تعرضه أيّ شاشة عن نفس اليوم.
--
-- ■ الحدّ ٣٦٠٠٠ ثانية = ٦٠٠ دقيقة بالضبط، منسوخٌ من الأربعة لا مخترعًا.
--
-- ■ ولا يمسّ صفًّا تاريخيًّا: الدالّة تحسب لليوم الذي تُستدعى به. الصفوف
--   القديمة تبقى بقيمها حتى تُعاد لها الحسبة. وهذا مقصود — لا نُعيد كتابة
--   تاريخٍ مخزَّن في ترحيلٍ هدفُه توحيد تعريف.
--
-- ■ بإحلالٍ نصّيٍّ مرتكز لا بإعادة كتابة الدالّة: إعادة الكتابة تُعيد معها
--   أيّ انحرافٍ حيٍّ لا نعلمه، والمرساة تسقط صاخبةً إن لم تُطابق.
--
-- التراجع: 0201_ROLLBACK_daily_stats_wait_outlier_cap.sql (مكتوبٌ قبل هذا).

do $mig$
declare d text; d2 text; v_old text; v_new text;
begin
  select pg_get_functiondef(oid) into d from pg_proc
   where proname = 'rollup_daily_stats' and pronamespace = 'public'::regnamespace;

  v_old :=
       E'    COALESCE(round(avg(EXTRACT(EPOCH FROM (seated_at - joined_at)))\n'
    || E'      FILTER (WHERE status = ''seated'' AND seated_at IS NOT NULL AND seated_at >= d_start AND seated_at < d_end))::int, 0),';

  v_new :=
       E'    COALESCE(round(avg(EXTRACT(EPOCH FROM (seated_at - joined_at)))\n'
    || E'      FILTER (WHERE status = ''seated'' AND seated_at IS NOT NULL AND seated_at >= d_start AND seated_at < d_end\n'
    || E'              AND EXTRACT(EPOCH FROM (seated_at - joined_at)) >= 0\n'
    || E'              AND EXTRACT(EPOCH FROM (seated_at - joined_at)) <  36000))::int, 0),';

  d2 := replace(d, v_old, v_new);
  if d2 = d then raise exception 'مرساة متوسّط الانتظار لم تُطابق — الدالّة انحرفت أو الترحيل مطبَّقٌ سلفًا'; end if;
  execute d2;
end $mig$;

-- تحقّقٌ بعديّ: السقف دخل، والحارس القائم لم يُكسَر، ولا فحص انحدر
do $verify$
declare v_def text; v_red int;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc
   where proname = 'rollup_daily_stats' and pronamespace = 'public'::regnamespace;

  if position('36000' in v_def) = 0 then
    raise exception 'السقف لم يدخل الدالّة';
  end if;

  -- ‏rollup_riyadh_day في run_critical_checks يشترط بقاء هذا النصّ حرفيًّا
  if v_def not like '%Asia/Riyadh%' then
    raise exception 'ضاع Asia/Riyadh — الفحص rollup_riyadh_day سيسقط';
  end if;

  -- شبكة الفحوص تعيش على الإنتاج وحده (المحاكاة بلا run_critical_checks).
  -- فنسأل عن وجودها بدل أن نفترضه: غيابها تخطٍّ معلَنٌ لا سقوطٌ صامت.
  if to_regprocedure('public.run_critical_checks()') is null then
    raise notice 'run_critical_checks غائبة (محاكاة) — تُخطّى أكيدة الفحوص';
  else
    select count(*) into v_red from public.run_critical_checks()
     where not pass and name in ('rollup_riyadh_day', 'q20_schema_no_drift');
    if v_red > 0 then
      raise exception 'فحصٌ متعلّقٌ بالدالّة صار أحمر بعد التعديل (%)', v_red;
    end if;
  end if;
end
$verify$;
