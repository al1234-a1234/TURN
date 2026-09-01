-- ═══ الموجة ١ — سحب دوالّ التقرير اليوميّ من أدوار العملاء (HIGH-2) ═══
-- التراجع: 0178_ROLLBACK_wave1_report_fn_grants.sql
revoke execute on function public.snapshot_payload()                       from anon, authenticated, public;
revoke execute on function public.report_flags(jsonb)                      from anon, authenticated, public;
revoke execute on function public.report_since_label(text, jsonb)          from anon, authenticated, public;
revoke execute on function public.report_window_change(text, jsonb, jsonb) from anon, authenticated, public;
revoke execute on function public.daily_report_text(jsonb, jsonb, jsonb)   from anon, authenticated, public;
do $verify$
begin
  if has_function_privilege('anon','public.snapshot_payload()','EXECUTE')
     or has_function_privilege('authenticated','public.snapshot_payload()','EXECUTE') then
    raise exception 'السحب لم يقع'; end if;
  if not has_function_privilege('postgres','public.snapshot_payload()','EXECUTE') then
    raise exception 'خطرٌ: postgres فقد التنفيذ'; end if;
end $verify$;
