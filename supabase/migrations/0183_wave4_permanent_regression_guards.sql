-- ═══ الموجة ٤ — حراسٌ دائمون: يُمسَك الانحراف وقت الترحيل لا وقت التدقيق ═══
--
-- كلّ ثغرةٍ وجدها تدقيق ٢٠٢٦-٠٩-٠١ دخلت من بابٍ واحد: CREATE FUNCTION يمنح
-- EXECUTE لـ PUBLIC افتراضًا ولا شيء يصرخ. وأخطر عطلٍ في تاريخ المشروع
-- (٢٥-٢٦ أغسطس، عشر ساعات) دخل من بابٍ ثانٍ: سياساتٌ كُتبت {public} فظُنّ
-- أنّها تمنح ما لا تمنح. فحارسٌ على البابين.
--
-- والحراسة بخطّ أساسٍ لا بمنعٍ مطلق: ٥٨ سياسةً قائمة اليوم {public} وتعمل
-- صحيحًا (شروطها هي التي تحصر لا الدور)، وإعادةُ كتابتها كلّها الآن هي
-- بالضبط ما أسقط الموقع في أغسطس. فالحارس يمنع الزيادة لا القائم.
do $mig$
declare d text; d2 text; v_new text;
begin
  select pg_get_functiondef(oid) into d
    from pg_proc where proname='run_critical_checks' and pronamespace='public'::regnamespace;
  if d is null then raise exception 'run_critical_checks غير موجودة'; end if;

  v_new :=
       E'    (''w47_no_new_anon_secdef'', not exists (\n'
    || E'        select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace\n'
    || E'         where n.nspname=''public'' and p.prokind=''f'' and p.prosecdef\n'
    || E'           and has_function_privilege(''anon'', p.oid, ''EXECUTE'')\n'
    || E'           and p.proname not in (\n'
    || E'             ''can_access_branch'',''has_feature'',''health_snapshot'',''is_brand_manager'',\n'
    || E'             ''is_manager_of'',''is_platform_admin'',''is_staff_of'',''my_branch_ids'',\n'
    || E'             ''my_branch_ids_for'',''my_managed_branch_ids'',''queue_version'',\n'
    || E'             ''reservation_slots'',''restaurant_of_branch'',''staff_can_read_customer'',\n'
    || E'             ''staff_has_perm'',''tv_queue'',''waitlist_counts_by_zone'',\n'
    || E'             ''waitlist_counts_for'',''waitlist_ticket_by_id'',''waitlist_ticket_status''))),\n'
    || E'    (''w48_public_scoped_policies_baseline'',\n'
    || E'       (select count(*) from pg_policies where schemaname=''public''\n'
    || E'          and roles::text[] @> array[''public'']) <= 58),\n'
    || E'    (''w49_customer_read_is_perm_mapped'',\n'
    || E'       (select pg_get_functiondef(oid) ~ ''my_branch_ids_for''\n'
    || E'          from pg_proc where proname=''staff_can_read_customer''\n'
    || E'           and pronamespace=''public''::regnamespace)),\n'
    || E'    (''w50_ops_tables_sealed_from_clients'', not exists (\n'
    || E'        select 1 from information_schema.role_table_grants g\n'
    || E'         where g.table_schema=''public'' and g.grantee in (''anon'',''authenticated'')\n'
    || E'           and g.table_name in (''platform_admins'',''push_subscriptions'',''alert_config'',\n'
    || E'                                ''alert_state'',''client_errors'',''alert_outbox'',''app_salt'',\n'
    || E'                                ''daily_snapshot'',''phone_lookup_log'',''rate_limits''))),\n'
    || E'    (''w51_report_fns_not_client_executable'', not exists (\n'
    || E'        select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace\n'
    || E'         where n.nspname=''public''\n'
    || E'           and p.proname in (''snapshot_payload'',''report_flags'',''report_since_label'',\n'
    || E'                             ''report_window_change'',''daily_report_text'')\n'
    || E'           and (has_function_privilege(''anon'', p.oid, ''EXECUTE'')\n'
    || E'             or has_function_privilege(''authenticated'', p.oid, ''EXECUTE'')))),\n';

  d2 := replace(d, E'    (''q20_schema_no_drift'',', v_new || E'    (''q20_schema_no_drift'',');
  if d2 = d then raise exception 'مرساة q20 لم تُطابق — لم يُضف شيء'; end if;
  execute d2;
end
$mig$;

do $verify$
declare v_total int; v_fail text; v_missing text;
begin
  select count(*), coalesce(string_agg(name,'، ') filter (where not pass),'—')
    into v_total, v_fail from public.run_critical_checks();
  select coalesce(string_agg(k,'، '),'—') into v_missing
    from unnest(array['w47_no_new_anon_secdef','w48_public_scoped_policies_baseline',
                      'w49_customer_read_is_perm_mapped','w50_ops_tables_sealed_from_clients',
                      'w51_report_fns_not_client_executable']) k
   where k not in (select name from public.run_critical_checks());
  if v_missing <> '—' then raise exception 'فحوصٌ لم تُضف: %', v_missing; end if;
  if v_fail   <> '—' then raise exception 'فحوصٌ راسبة بعد الإضافة: %', v_fail; end if;
  raise notice 'المجموع الآن % فحصًا، كلّها خضراء', v_total;
end
$verify$;