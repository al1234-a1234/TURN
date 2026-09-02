-- ============================================================================
--  تراجع 0202 — يعيد الإطفاء الفجريّ إلى مداه الكامل (نصّ 0150 حرفيًّا).
--
--  مكتوبٌ قبل التطبيق ومُختبَرٌ لا مفترَض. وأثرُه أنّ مسبار /api/canary يعود
--  أحمر عند أوّل ليلة — وذلك هو السلوك قبل 0202 لا انحدارٌ جديد.
--
--  ولا يُعيد إيقاف فروع النبض فورًا: الكرون يفعل ذلك في موعده. وإعادةُ
--  إطفائها هنا تُخفي على من يقرأ الأثر متى وقع الإطفاء ولماذا.
-- ============================================================================

select cron.unschedule('reset-manual-flags')
 where exists (select 1 from cron.job where jobname='reset-manual-flags');

select cron.schedule('reset-manual-flags', '0 1 * * *', $cron$
  update public.branch_settings
     set manually_closed = false, busy_now = false, queue_paused = true
   where manually_closed or busy_now or not queue_paused
$cron$);

-- ونزع الحارسين — بقاؤهما بعد التراجع يعني فحصًا أحمر دائمًا يعلّم المالك
-- تجاهل الأحمر، وهو أخطر من غياب الحارس (الميثاق §٢-٥).
do $mig$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='run_critical_checks';
  if v_def is null then raise exception 'run_critical_checks غير موجودة'; end if;

  v_def := replace(v_def,
      E'    (\'w29_dawn_spares_canary\', (select command like \'%is_canary%\'\n'
   || E'                                  from cron.job where jobname=\'reset-manual-flags\')),\n'
   || E'    (\'w29_canary_queue_open\', not exists (\n'
   || E'        select 1 from public.branch_settings s\n'
   || E'          join public.branches b on b.id = s.branch_id\n'
   || E'          join public.restaurants r on r.id = b.restaurant_id\n'
   || E'         where r.is_canary and s.queue_paused)),\n'
   || E'    (\'w28_push_log_names_sub\',',
      E'    (\'w28_push_log_names_sub\',');

  execute v_def;
end
$mig$;
