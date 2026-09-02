-- ============================================================================
--  تراجع ٠٢٠٦ — إزالة فحص انحدار الصلاحيات.
--
--  مكتوبٌ قبل الترحيل ومُختبَرٌ لا مفترَض.
--
--  وأثرُه أنّ انحدار الصلاحيات يعود بلا رصد — أي الحال قبل ٠٢٠٦، وهي الحال
--  التي مرّ فيها CRITICAL-1 (‏٠١٩٢) غيرَ مكتشَفٍ حتى تدقيقٍ يدويّ.
-- ============================================================================

-- الحارس يُنزع أوّلًا: بقاؤه بعد سقوط الدالّة يعني فحصًا يرمي لا فحصًا أحمر.
do $mig$
declare v_def text; v_before text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='run_critical_checks';
  if v_def is null then raise exception 'run_critical_checks غير موجودة'; end if;

  v_before := v_def;
  v_def := replace(v_def,
      E'    (\'w30_no_permission_drift\', (public.check_permission_drift() ->> \'ok\')::boolean),\n'
   || E'    (\'w28_push_log_names_sub\',',
      E'    (\'w28_push_log_names_sub\',');

  -- وإعادة عدّاد الدوالّ: ١٤٥ ← ١٤٤
  v_def := replace(v_def, E'and p.prokind=\'f\') = 145', E'and p.prokind=\'f\') = 144');

  if v_def = v_before then
    raise exception 'لم يُطابَق مرتكز w30 ولا عدّاد ١٤٥ — راجع الحالة قبل المتابعة';
  end if;

  execute v_def;
end
$mig$;

drop function if exists public.check_permission_drift();
