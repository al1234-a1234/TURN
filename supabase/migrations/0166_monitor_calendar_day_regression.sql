-- ============================================================================
--  حارسٌ دائم ضدّ عودة عطل «اليوم التقويميّ» — سدُّ فجوة رصدٍ كشفها التدقيق.
--
--  0165 أصلح سبع دوالّ كانت تُسقط عميلًا حيًّا عند عبور منتصف الليل. لكن لا شيء
--  في run_critical_checks كان يمسك عودة النمط لو أعاده أحدٌ مستقبلًا: صفرٌ من
--  ٢٠٣ فحصًا يخصّ هذا. فالإصلاح صامتٌ بلا حارس — يُنقَض بلا إنذار.
--
--  هذا الترحيل يضيف فحصًا واحدًا: q34_no_calendar_day_predicate. يمرّ ما دامت
--  لا دالّة عامّة تحوي مساواةَ اليومِ التقويميّ لصفوف الطابور:
--      (X.joined_at at time zone 'Asia/Riyadh')::date = (now() … )::date
--  ويسقط فور ظهورها. النمط دقيقٌ عمدًا: يطابق المساواةَ الحيّة وحدها، لا
--  التجميعَ اليوميّ المشروع في rollup_daily_stats/branch_busy_hours (تلك
--  تقارير، لا حراسةُ حياةٍ — وتغييرها قرارُ عملٍ لا خللٌ تقنيّ).
--
--  أُدرِج بإلحاقٍ جراحيّ لصفٍّ واحد في قائمة VALUES داخل run_critical_checks،
--  بمرساةٍ فريدة، وبحارسٍ يتوقّف إن لم تُطابق المرساة (فلا يُكسَر الفحص).
--  لا دالّة جديدة تُضاف، فعدّاد q20 يبقى ١٤٤ بلا تحريك.
--
--  ── مُختبَرٌ حيًّا على الإنتاج قبل التوثيق ──
--   • بعد التطبيق: ٢٠٤/٢٠٤ خضراء، q34 حاضرٌ وصحيح.
--   • زُرِعت دالّةٌ تحمل النمط في معاملةٍ فرعية: المكتشِف طابق (١)، وq34 سقط
--     (false). وبعد التراجع: المكتشِف صفر، q34 صحيح. أي أنّه يمسك العودة فعلًا.
-- ============================================================================

do $mig$
declare d text; d2 text;
begin
  select pg_get_functiondef(oid) into d
    from pg_proc where proname='run_critical_checks' and pronamespace='public'::regnamespace;
  if d is null then raise exception 'run_critical_checks غير موجودة'; end if;

  d2 := replace(
    d,
    $srch$= 40)
  )
  select name, pass from checks;$srch$,
    $repl$= 40),
    ('q34_no_calendar_day_predicate', not exists (
        select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.prokind='f'
           and pg_get_functiondef(p.oid) ~ '\(([a-z0-9_]+)\.joined_at at time zone ''Asia/Riyadh''\)::date\s*=\s*\(now\(\) at time zone ''Asia/Riyadh''\)::date'))
  )
  select name, pass from checks;$repl$);

  if d2 = d then
    raise exception 'المرساة لم تُطابق — لم يتغيّر التعريف. توقّف قبل أن أكسر الفحص.';
  end if;
  execute d2;
end
$mig$;

-- المتوقَّع بعد التطبيق: ٢٠٤/٢٠٤ خضراء · q34_no_calendar_day_predicate = pass.
