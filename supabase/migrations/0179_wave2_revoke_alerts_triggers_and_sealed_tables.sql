-- ═══ الموجة ٢ — MEDIUM-1، MEDIUM-2، LOW-1 ═══
-- (١) حارسا يوم الإطلاق كانا قابلَين للتنفيذ من anon وكلاهما يرسل تلغرام.
--     مستدعيهما الوحيد cron بدور postgres.
revoke execute on function public.alert_peak_join_stall()     from anon, authenticated, public;
revoke execute on function public.alert_position_duplicates() from anon, authenticated, public;

-- (٢) set_branch_join_frozen: **يبقى authenticated** — شاشة الاستقبال تستدعيه
--     بجلسة الموظّف (status-actions.ts:76). يُسحب من anon و PUBLIC فقط.
revoke execute on function public.set_branch_join_frozen(uuid, boolean, text) from anon, public;

-- (٣) دالّتا المحفّزات: PostgreSQL يفحص الصلاحية عند إنشاء المحفّز لا عند
--     إطلاقه — أُثبت على المحاكاة: التجليس نجح والمحفّز كتب queue_events.
revoke execute on function public.audit_row_delete() from anon, authenticated, public;
revoke execute on function public.log_queue_event()  from anon, authenticated, public;

-- (٤) LOW-1: منحٌ متبقٍّ على جداول RLS-بلا-سياسات. service_role يحتفظ بمنحه.
revoke all on public.platform_admins    from anon, authenticated;
revoke all on public.push_subscriptions from anon, authenticated;
revoke all on public.alert_config       from anon, authenticated;
revoke all on public.alert_state        from anon, authenticated;
revoke all on public.client_errors      from anon, authenticated;

do $verify$
begin
  if has_function_privilege('anon','public.set_branch_join_frozen(uuid,boolean,text)','EXECUTE')
     or has_function_privilege('anon','public.log_queue_event()','EXECUTE') then
    raise exception 'السحب لم يقع'; end if;
  if not has_function_privilege('authenticated','public.set_branch_join_frozen(uuid,boolean,text)','EXECUTE') then
    raise exception 'خطرٌ: زرّ إيقاف الانضمام سينكسر'; end if;
  if not has_table_privilege('service_role','public.alert_config','SELECT') then
    raise exception 'خطرٌ: قناة تلغرام ستنكسر'; end if;
end $verify$;
