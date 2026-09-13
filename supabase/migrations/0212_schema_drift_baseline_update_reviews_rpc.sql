-- تحديث خطّ أساس q20_schema_no_drift بعد إضافة reviews_summary (0211):
-- الدوال العامّة صارت ١٤٩ (كانت ١٤٨). تحقّقتُ من العدد حيًّا على الإنتاج قبل
-- الكتابة، وباقي الأعداد الثلاثة (جداول ٣٦، سياسات ٧٤، مفاتيح أجنبية ٤٤)
-- بلا تغيير.

CREATE OR REPLACE FUNCTION public.run_critical_checks()
 RETURNS TABLE(name text, pass boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with checks(name, pass) as (
    values
    ('demo_generator_dropped',   to_regprocedure('public.demo_live_activity()') is null),
    ('claim_code_hidden_anon',   not has_column_privilege('anon','public.restaurants','claim_code','SELECT')),
    ('claim_code_hidden_authed', not has_column_privilege('authenticated','public.restaurants','claim_code','SELECT')),
    ('owner_phone_hidden_anon',  not has_column_privilege('anon','public.restaurants','owner_phone','SELECT')),
    ('owner_user_hidden_anon',   not has_column_privilege('anon','public.restaurants','owner_username','SELECT')),
    ('public_cols_readable',     has_column_privilege('anon','public.restaurants','slug','SELECT')
                                 and has_column_privilege('anon','public.restaurants','name','SELECT')),
    ('admin_list_locked',        not has_function_privilege('anon','public.admin_restaurants_list()','EXECUTE')),
    ('write_join_closed',        not has_function_privilege('anon','public.join_waitlist_guest(uuid,text,text,integer,text)','EXECUTE')
                                 and not has_function_privilege('authenticated','public.join_waitlist_guest(uuid,text,text,integer,text)','EXECUTE')),
    ('write_cancel_closed',      not has_function_privilege('anon','public.cancel_waitlist_guest(uuid,text)','EXECUTE')),
    ('write_review_closed',      not has_function_privilege('anon','public.submit_review(text,text,integer,text)','EXECUTE')),
    ('phone_lookup_closed',      not has_function_privilege('anon','public.guest_status_by_phone(text)','EXECUTE')
                                 and not has_function_privilege('anon','public.guest_status_by_phone(text,text)','EXECUTE')
                                 and not has_function_privilege('anon','public.rewards_by_phone(text)','EXECUTE')
                                 and not has_function_privilege('anon','public.rewards_by_phone(text,text)','EXECUTE')),
    ('phone_lookup_hides_name',
     (select pg_get_functiondef(oid) not like '%full_name%'
        from pg_proc where proname='guest_status_by_phone' and pronargs=2)),
    ('phone_lookup_returns_venue',
     (select pg_get_functiondef(oid) like '%venue_slug%'
        from pg_proc where proname='guest_status_by_phone' and pronargs=2)),
    ('phone_lookup_hides_res_id',
     (select pg_get_functiondef(oid) like '%null::uuid%'
        from pg_proc where proname='guest_status_by_phone' and pronargs=2)),
    ('rewards_lookup_hides_venue',
     (select pg_get_functiondef(oid) not like '%r.name%'
        from pg_proc where proname='rewards_by_phone' and pronargs=2)),
    ('phone_lookup_rate_by_caller',
     (select pg_get_functiondef(oid) like '%gstat:ip%'
        from pg_proc where proname='guest_status_by_phone' and pronargs=2)),
    ('rewards_lookup_rate_by_caller',
     (select pg_get_functiondef(oid) like '%rewards:ip%'
        from pg_proc where proname='rewards_by_phone' and pronargs=2)),
    ('phone_lookup_distinct_cap',
     (select pg_get_functiondef(oid) like '%gstat:ipn:%'
        from pg_proc where proname='guest_status_by_phone' and pronargs=2)),
    ('phone_lookup_audited',      to_regclass('public.phone_lookup_log') is not null),
    ('phone_log_hashed_only',
     (select pg_get_functiondef(oid) like '%digest(v_salt%'
        from pg_proc where proname='guest_status_by_phone' and pronargs=2)),
    ('phone_log_server_only',     not has_function_privilege('anon','public.retire_phone_lookup_log()','EXECUTE')
                                 and not has_function_privilege('authenticated','public.retire_phone_lookup_log()','EXECUTE')),
    ('book_stays_for_staff',     has_function_privilege('authenticated','public.book_reservation_guest(uuid,text,text,timestamptz,integer,text,text)','EXECUTE')
                                 and not has_function_privilege('anon','public.book_reservation_guest(uuid,text,text,timestamptz,integer,text,text)','EXECUTE')),
    ('browser_reads_open',       has_function_privilege('anon','public.waitlist_ticket_status(uuid,text)','EXECUTE')
                                 and has_function_privilege('anon','public.waitlist_counts_for(uuid[])','EXECUTE')
                                 and has_function_privilege('anon','public.reservation_slots(uuid,date,integer,text)','EXECUTE')),
    ('owner_cols_closed_authed', not has_column_privilege('authenticated','public.restaurants','owner_phone','SELECT')
                                 and not has_column_privilege('authenticated','public.restaurants','owner_username','SELECT')),
    ('board_rpc_closed_anon',    not has_function_privilege('anon','public.staff_branch_queue(uuid)','EXECUTE')
                                 and has_function_privilege('authenticated','public.staff_branch_queue(uuid)','EXECUTE')),
    ('push_log_server_only',     not has_function_privilege('anon','public.log_push_sends(jsonb)','EXECUTE')
                                 and not has_function_privilege('authenticated','public.log_push_sends(jsonb)','EXECUTE')),
    ('anon_blocked_rollup',      not has_function_privilege('anon','public.rollup_all_daily_stats(date)','EXECUTE')),
    ('anon_blocked_digest',      not has_function_privilege('anon','public.run_daily_digest()','EXECUTE')),
    ('anon_blocked_del_push',    not has_function_privilege('anon','public.delete_push_subscription(text)','EXECUTE')),
    ('check_rate_locked',        not has_function_privilege('anon','public.check_rate(text,integer,interval)','EXECUTE')),
    ('del_dead_push_locked',     not has_function_privilege('anon','public.delete_dead_push_subscription(text)','EXECUTE')),
    ('join_path_alive',          has_function_privilege('service_role','public.join_waitlist_guest(uuid,text,text,integer,text)','EXECUTE')),
    ('anon_can_ticket',          has_function_privilege('anon','public.waitlist_ticket_status(uuid,text)','EXECUTE')),
    ('guard_confirm_unknown',    public.confirm_attendance('00000000-0000-0000-0000-000000000000') = false),
    ('guard_cancel_unknown',     public.cancel_by_ticket('00000000-0000-0000-0000-000000000000'::uuid, null) = false),
    ('guard_review_bad_rating',  public.submit_review('eficto','0506089164',9,null)->>'error' = 'invalid_rating'),
    ('guard_review_no_visit',    public.submit_review('eficto',
                                   '05' || lpad((floor(random()*100000000))::bigint::text, 8, '0'),
                                   5, null)->>'error' = 'no_visit'),
    ('guard_push_wrong_phone',   public.save_push_subscription('00000000-0000-0000-0000-000000000000','0500000000','https://x.invalid/e','k','a') = false),
    ('norm_arabic',              public.norm_phone_input('Ù Ù¥Ù Ù¦Ù Ù¨Ù©Ù¡Ù¦Ù¤') = '506089164'),
    ('norm_intl',                public.norm_phone_input('+966 506 089 164') = '506089164'),
    ('norm_plain',               public.norm_phone_input('0506089164') = '506089164'),
    ('idx_phone_norm',           exists(select 1 from pg_indexes where indexname='idx_customers_phone_norm')),
    ('idx_waitlist_active',      exists(select 1 from pg_indexes where indexname='idx_waitlist_active')),
    ('trigger_has_row_lock',     (select pg_get_functiondef(oid) ilike '%for update%'
                                  and pg_get_functiondef(oid) not ilike '%pg_advisory_xact_lock%'
                                  from pg_proc where proname='set_waitlist_position')),
    ('no_null_branch_menu',      not exists(select 1 from public.menu_items where branch_id is null)),
    ('no_cross_branch_refs',     not exists(select 1 from public.menu_items i join public.menu_categories c on c.id=i.category_id where c.branch_id<>i.branch_id)),
    ('branch_matches_restaurant',not exists(select 1 from public.menu_items i join public.branches b on b.id=i.branch_id where b.restaurant_id<>i.restaurant_id)),
    ('branch_guard_exists',      exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                        where n.nspname='public' and p.proname='can_access_branch')),
    ('branch_rls_everywhere',    not exists(
                                   select 1 from pg_policies
                                   where schemaname='public'
                                     and tablename in ('waitlist_entries','reservations','tables','branch_settings',
                                                       'notifications','daily_stats','menu_categories','menu_items',
                                                       'restaurant_photos',
                                                       'reviews','branches','staff','queue_events')
                                     and (qual like '%is_staff_of%' or qual like '%staff_has_perm%' or qual like '%is_manager_of%')
                                     and qual not like '%can_access_branch%'
                                     and qual not like '%my_branch_ids%')),
    ('branch_guard_in_push_rpc', (select pg_get_functiondef(oid) like '%can_access_branch%'
                                  from pg_proc where proname='queue_push_targets')),
    ('branch_guard_in_customer', (select pg_get_functiondef(oid) like '%my_branch_ids%'
                                  from pg_proc where proname='staff_can_read_customer')),
    ('reward_code_trigger',      exists(select 1 from pg_trigger where tgname='trg_reward_code')),
    ('no_active_reward_no_code', not exists(select 1 from public.customer_rewards
                                            where status='active' and (code is null or btrim(code)=''))),
    ('staff_redeem_exists',      exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                        where n.nspname='public' and p.proname='staff_redeem_reward')),
    ('offers_fully_removed',     not exists(select 1 from information_schema.tables
                                            where table_schema='public' and table_name in ('offers','offer_redemptions'))),
    ('anon_blocked_self_redeem', not has_function_privilege('anon','public.redeem_customer_reward(uuid,text)','EXECUTE')),
    ('validate_before_limit',    (select position('invalid_rating' in pg_get_functiondef(oid))
                                       < position('check_rate' in pg_get_functiondef(oid))
                                  from pg_proc where proname='submit_review')),
    ('my_restaurant_status_gone',to_regprocedure('public.my_restaurant_status(text,text)') is null),
    ('anon_can_health',          has_function_privilege('anon','public.health_snapshot()','EXECUTE')),
    ('rate_limits_unlogged',     (select relpersistence = 'u' from pg_class c
                                  join pg_namespace n on n.oid=c.relnamespace
                                  where n.nspname='public' and c.relname='rate_limits')),
    ('winback_table',            exists(select 1 from information_schema.tables
                                        where table_schema='public' and table_name='winback_settings')),
    ('armed_at_col',             exists(select 1 from information_schema.columns
                                        where table_schema='public' and table_name='customer_rewards' and column_name='armed_at')),
    ('rewards_by_phone_guarded', (select pg_get_functiondef(oid) like '%check_rate%'
                                  from pg_proc where proname='rewards_by_phone' and pronargs=2)),
    ('arm_by_phone_guarded',     (select pg_get_functiondef(oid) like '%check_rate%'
                                  from pg_proc where proname='set_reward_armed_by_phone')),
    ('reception_gifts_fn',       exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                        where n.nspname='public' and p.proname='reception_armed_gifts')),
    ('redeem_clears_armed',      (select pg_get_functiondef(oid) like '%armed_at = null%'
                                  from pg_proc where proname='staff_redeem_reward')),
    ('no_loyalty_tables',        not exists(select 1 from information_schema.tables
                                        where table_schema='public'
                                          and table_name in ('checkins','checkin_settings','loyalty_programs'))),
    ('retention_no_checkins',    (select pg_get_functiondef(oid) not like '%checkins%'
                                  from pg_proc where proname='retire_dormant_customers')),
    ('rollup_riyadh_day',        (select pg_get_functiondef(oid) like '%Asia/Riyadh%' from pg_proc where proname='rollup_daily_stats')),
    ('digest_riyadh_day',        (select pg_get_functiondef(oid) like '%Asia/Riyadh%' from pg_proc where proname='run_daily_digest')),
    ('visit_idempotency_col',    exists(select 1 from information_schema.columns
                                        where table_schema='public' and table_name='waitlist_entries' and column_name='visit_counted_at')),
    ('uniq_guest_phone',         exists(select 1 from pg_indexes where indexname='uniq_customers_phone_guest')),
    ('uniq_live_entry',          exists(select 1 from pg_indexes where indexname='uniq_waitlist_live_customer_branch')),
    ('brand_guard_exists',       exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                        where n.nspname='public' and p.proname='is_brand_manager')),
    ('brand_only_restaurant',    (select qual like '%is_brand_manager%' from pg_policies
                                  where schemaname='public' and tablename='restaurants'
                                    and policyname='manager or admin updates restaurant')),
    ('brand_only_insights',      (select bool_and(qual like '%is_brand_manager%') from pg_policies
                                  where schemaname='public' and tablename='owner_insights')),
    ('campaign_branch_scoped',   (select pg_get_functiondef(oid) like '%caller_branch_id%'
                                  from pg_proc where proname='grant_reward_to_segment')),
    ('rls_customers',            (select relrowsecurity from pg_class where relname='customers')),
    ('rls_waitlist',             (select relrowsecurity from pg_class where relname='waitlist_entries')),
    ('rls_push_subs',            (select relrowsecurity from pg_class where relname='push_subscriptions')),
    ('bucket_readable',          exists(select 1 from pg_policies
                                        where schemaname='storage' and tablename='buckets'
                                          and cmd='SELECT' and 'authenticated' = any(roles))),
    ('objects_readable',         exists(select 1 from pg_policies
                                        where schemaname='storage' and tablename='objects'
                                          and cmd='SELECT' and 'authenticated' = any(roles))),
    ('live_rank_math',           not exists(
                                   select 1 from public.waitlist_entries w
                                   join public.customers c on c.id = w.customer_id
                                   cross join lateral public.waitlist_ticket_status(w.id, c.phone) t
                                   where w.status in ('waiting','notified')
                                     and t."position" is distinct from t.ahead + 1)),
    ('q01_retire_locked_anon',   not has_function_privilege('anon','public.retire_dormant_customers(integer)','EXECUTE')),
    ('q02_retire_locked_auth',   not has_function_privilege('authenticated','public.retire_dormant_customers(integer)','EXECUTE')),
    ('q03_old_rewards_locked',   not has_function_privilege('anon','public.get_customer_rewards(text)','EXECUTE')),
    ('q04_rls_every_table',      not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                                            where n.nspname='public' and c.relkind='r' and not c.relrowsecurity)),
    ('q05_secdef_anon_surface',  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                  where n.nspname='public' and p.prokind='f' and p.prosecdef
                                    and has_function_privilege('anon',p.oid,'EXECUTE')) <= 30),
    ('q06_anon_stmt_timeout',    (select coalesce((select option_value from pg_options_to_table(rolconfig)
                                                   where option_name='statement_timeout'),'') <> ''
                                  from pg_roles where rolname='anon')),
    ('q07_party_size_capped',    exists(select 1 from pg_constraint where conname='waitlist_entries_party_size_max')),
    ('q08_customer_name_len',    exists(select 1 from pg_constraint where conname='customers_full_name_len')),
    ('q09_menu_text_len',        exists(select 1 from pg_constraint where conname='menu_items_name_len')),
    ('q10_storage_images_only',  not exists(select 1 from storage.buckets
                                            where allowed_mime_types is null
                                               or 'image/svg+xml' = any(allowed_mime_types)
                                               or 'text/html'     = any(allowed_mime_types))),
    ('q11_storage_size_capped',  not exists(select 1 from storage.buckets where file_size_limit is null)),
    ('q12_staff_checks_active',  (select pg_get_functiondef(oid) ilike '%is_active%' from pg_proc where proname='is_staff_of')),
    ('q13_perm_checks_active',   (select pg_get_functiondef(oid) ilike '%is_active%' from pg_proc where proname='staff_has_perm')),
    ('q14_branches_check_active',(select pg_get_functiondef(oid) ilike '%is_active%' from pg_proc where proname='my_branch_ids')),
    ('q15_join_burst_600',       (select pg_get_functiondef(oid) like '%600, interval ''1 minute''%'
                                  from pg_proc where proname='join_waitlist_guest')),
    ('q16_join_clamps_party',    (select pg_get_functiondef(oid) like '%least(greatest%' from pg_proc where proname='join_waitlist_guest')),
    ('q17_join_clamps_name',     (select pg_get_functiondef(oid) like '%left(trim(p_full_name), 120)%' from pg_proc where proname='join_waitlist_guest')),
    ('q18_cron_jobs_present',    (select count(*) from cron.job) >= 7),
    ('q19_no_orphan_waitlist',   not exists(select 1 from public.waitlist_entries w
                                            left join public.branches b on b.id = w.branch_id
                                            where b.id is null)),
    ('q21_autovacuum_tuned',     (select coalesce(array_to_string(reloptions,','),'') like '%autovacuum_vacuum_scale_factor=0.02%'
                                  from pg_class where relname='waitlist_entries')),
    ('q22_status_guard',         exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
                                        where c.relname='waitlist_entries'
                                          and t.tgname='trg_guard_waitlist_status')),
    ('q23_push_targets_locked',  not has_function_privilege('anon','public.queue_push_targets_after_cancel(uuid,text)','EXECUTE')
                                 and not has_function_privilege('anon','public.queue_push_targets_after_ticket_cancel(uuid)','EXECUTE')),
    ('q24_guest_can_cancel',     has_function_privilege('service_role','public.cancel_by_ticket(uuid,text)','EXECUTE')
                                 and has_function_privilege('service_role','public.cancel_waitlist_guest(uuid,text)','EXECUTE')),
    ('q25_new_branch_gets_zones', exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
                                  where c.relname='branches' and t.tgname='t_branch_default_zones')),
    ('q25_no_branch_without_zone',not exists(
                                   select 1 from public.branches b
                                   where b.is_active
                                     and not exists(select 1 from public.branch_zones z
                                                    where z.branch_id=b.id and z.is_active))),
    ('q25_guard_keeps_value',    (select pg_get_functiondef(oid) like '%if v_fallback is null then return new; end if;%'
                                  from pg_proc where proname='enforce_zone_belongs_to_branch')),
    ('q26_guest_recovery',       has_function_privilege('service_role','public.guest_status_by_phone(text,text)','EXECUTE')),
    ('q26_guest_can_cancel_res', has_function_privilege('service_role','public.cancel_reservation_guest(uuid,text)','EXECUTE')),
    ('q26_recovery_rate_limited',(select pg_get_functiondef(oid) like '%check_rate%'
                                  from pg_proc where proname='guest_status_by_phone' and pronargs=2)),
    ('q26_cancel_needs_phone',   (select pg_get_functiondef(oid) like '%norm_phone_input%'
                                  from pg_proc where proname='cancel_reservation_guest')),
    ('w2_reviews_insert_locked', not has_table_privilege('anon','public.reviews','insert')
                                 and not has_table_privilege('authenticated','public.reviews','insert')),
    ('w2_reviews_no_ins_policy', not exists(select 1 from pg_policies
                                  where schemaname='public' and tablename='reviews' and cmd='INSERT')),
    ('w2_review_one_per_cust',   exists(select 1 from pg_indexes
                                  where indexname='uniq_review_per_customer_restaurant')),
    ('w2_queue_delete_managers', (select bool_and(qual like '%my_managed_branch_ids%')
                                  from pg_policies where schemaname='public'
                                    and tablename in ('waitlist_entries','reservations')
                                    and cmd='DELETE')
                                 and (select count(*) from pg_policies where schemaname='public'
                                       and tablename in ('waitlist_entries','reservations')
                                       and cmd='DELETE') = 2),
    ('w2_queue_perm_scoped',     (select count(*) from pg_policies where schemaname='public'
                                  and tablename in ('waitlist_entries','reservations')
                                  and cmd in ('SELECT','INSERT','UPDATE')
                                  and coalesce(qual,with_check) like '%my_branch_ids_for%') = 6),
    ('w2_queue_delete_audited',  (select count(*) from pg_trigger
                                  where tgname in ('trg_audit_delete_waitlist',
                                                   'trg_audit_delete_reservations')) = 2),
    ('w2_read_perm_customers',   not exists(select 1 from pg_policies
                                  where schemaname='public' and tablename='customer_restaurant'
                                    and cmd in ('SELECT','ALL') and qual like '%is_staff_of%')),
    ('w2_read_perm_stats',       (select bool_or(qual like '%my_branch_ids_for%') from pg_policies
                                  where schemaname='public' and tablename='daily_stats' and cmd='SELECT')),
    ('w2_read_perm_notifs',      (select bool_or(qual like '%my_branch_ids_for%') from pg_policies
                                  where schemaname='public' and tablename='notifications' and cmd='SELECT')),
    ('w2_staff_self_readable',   (select bool_or(qual like '%auth.uid()%') from pg_policies
                                  where schemaname='public' and tablename='staff' and cmd='SELECT')),
    ('w3_position_no_daily_reset',(select pg_get_functiondef(oid) not like '%::date%'
                                   from pg_proc where proname='set_waitlist_position')),
    ('w3_position_lock_per_branch',(select pg_get_functiondef(oid) like '%where id = new.branch_id for update%'
                                   from pg_proc where proname='set_waitlist_position')),
    ('w3_expire_by_elapsed_only', (select pg_get_functiondef(oid) not like '%::date%'
                                    and pg_get_functiondef(oid) like '%8 hours%'
                                    and pg_get_functiondef(oid) not like '%45 minutes%'
                                    and pg_get_functiondef(oid) like '%branch_open_by_hours%'
                                   from pg_proc where proname='expire_stale_waitlist')),
    ('w3_no_duplicate_live_pos',  not exists(
                                   select 1 from public.waitlist_entries w
                                   where w.status in ('waiting','notified')
                                   group by w.branch_id, w.zone, w."position"
                                   having count(*) > 1)),
    ('w4_reservation_party_capped', exists(select 1 from pg_constraint
                                  where conname='reservations_party_size_max')),
    ('w4_max_party_size_ranged',    exists(select 1 from pg_constraint
                                  where conname='branch_settings_max_party_size_range')),
    ('w5_platform_health_exists', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                  where n.nspname='public' and p.proname='check_platform_health')),
    ('w5_platform_health_anon_blocked', not has_function_privilege('anon','public.check_platform_health()','EXECUTE')),
    ('w5_platform_health_authed_ok',    has_function_privilege('authenticated','public.check_platform_health()','EXECUTE')),
    ('w5_platform_health_shape',  (select public.check_platform_health()) is not null),
    ('q27_public_policy_fns_anon_executable',
      not exists (
        select 1
        from pg_policies pol
        cross join lateral regexp_matches(
               coalesce(pol.qual,'') || ' ' || coalesce(pol.with_check,''),
               '([a-z_][a-z0-9_]*)\s*\(', 'g') as fn(name)
        join pg_proc p on p.proname = fn.name[1]
          and p.pronamespace = (select oid from pg_namespace where nspname='public')
        where pol.schemaname='public'
          and (pol.roles @> array['public']::name[] or pol.roles @> array['anon']::name[])
          and p.prosecdef
          and not has_function_privilege('anon', p.oid, 'EXECUTE'))),
    ('w6_admin_delete_exists',    exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                  where n.nspname='public' and p.proname='admin_delete_restaurant')),
    ('w6_admin_delete_anon_blocked', not has_function_privilege('anon','public.admin_delete_restaurant(uuid)','EXECUTE')),
    ('w6_admin_canary_exists',    exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                  where n.nspname='public' and p.proname='admin_set_restaurant_canary')),
    ('w6_admin_canary_anon_blocked', not has_function_privilege('anon','public.admin_set_restaurant_canary(uuid,boolean)','EXECUTE')),
    ('w7_telegram_locked',        not has_function_privilege('anon','public.notify_telegram(text)','EXECUTE')
                                 and not has_function_privilege('authenticated','public.notify_telegram(text)','EXECUTE')),
    ('w7_alerts_locked',          not has_function_privilege('anon','public.send_platform_alerts()','EXECUTE')
                                 and not has_function_privilege('authenticated','public.send_platform_alerts()','EXECUTE')),
    ('w7_alerts_cron_alive',      exists(select 1 from cron.job
                                  where jobname='platform-health-alerts' and active)),
    ('w8_hours_day_override',     public.branch_open_by_hours(
                                    '{"open":"16:00","close":"23:00","days":{"5":{"open":"14:00","close":"23:00"}}}'::jsonb,
                                    '2026-08-28 15:00:00+03'::timestamptz) = true
                                 and public.branch_open_by_hours(
                                    '{"open":"16:00","close":"23:00","days":{"5":{"open":"14:00","close":"23:00"}}}'::jsonb,
                                    '2026-08-26 15:00:00+03'::timestamptz) = false),
    ('w8_hours_overnight_tail',   public.branch_open_by_hours(
                                    '{"open":"16:00","close":"23:00","days":{"5":{"open":"20:00","close":"03:00"}}}'::jsonb,
                                    '2026-08-29 02:00:00+03'::timestamptz) = true
                                 and public.branch_open_by_hours(
                                    '{"open":"16:00","close":"23:00","days":{"5":{"open":"20:00","close":"03:00"}}}'::jsonb,
                                    '2026-08-29 04:00:00+03'::timestamptz) = false),
    ('w8_hours_backcompat',       public.branch_open_by_hours('{"open":"18:00","close":"02:00"}'::jsonb, '2026-08-26 01:00:00+03'::timestamptz) = true
                                 and public.branch_open_by_hours('{"open":"18:00","close":"02:00"}'::jsonb, '2026-08-26 03:00:00+03'::timestamptz) = false
                                 and public.branch_open_by_hours('{}'::jsonb, '2026-08-26 04:00:00+03'::timestamptz) = true),
    ('w8_slots_day_aware',        (select pg_get_functiondef(oid) like '%''days''%'
                                   from pg_proc where proname='reservation_slots')),
    ('w9_manual_rating_col',      exists(select 1 from information_schema.columns
                                   where table_schema='public' and table_name='restaurants'
                                     and column_name='manual_rating')),
    ('w9_manual_rating_readable', has_column_privilege('anon','public.restaurants','manual_rating','SELECT')),
    ('w9_manual_rating_ranged',   exists(select 1 from pg_constraint
                                   where conname='restaurants_manual_rating_range')),
    ('w10_health_deeper_checks_present',
      (select h ? 'stuck_queue' and h ? 'join_flatline' and h ? 'db_connections'
              and (h->'homepage'->>'ms') is not null and (h->'restaurant_page'->>'ms') is not null
       from (select public.check_platform_health() as h) s)),
    ('w10_alerts_new_keys_wired', (select pg_get_functiondef(oid) like '%stuck_queue%'
                                    and pg_get_functiondef(oid) like '%join_flatline%'
                                    and pg_get_functiondef(oid) like '%db_connections%'
                                   from pg_proc where proname='send_platform_alerts')),
    ('w11_heartbeat_fn_exists',   exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                   where n.nspname='public' and p.proname='run_daily_heartbeat')),
    ('w11_heartbeat_locked',      not has_function_privilege('anon','public.run_daily_heartbeat()','EXECUTE')
                                 and not has_function_privilege('authenticated','public.run_daily_heartbeat()','EXECUTE')),
    ('w11_heartbeat_cron_alive',  exists(select 1 from cron.job
                                   where jobname='daily-heartbeat' and active)),
    ('w11_net_queue_wired',       (select pg_get_functiondef(oid) like '%net_queue%'
                                   from pg_proc where proname='check_platform_health')
                                 and (select pg_get_functiondef(oid) like '%net_queue%'
                                   from pg_proc where proname='send_platform_alerts')),
    ('w12_wl_terminal_frozen',    (select pg_get_functiondef(oid) like '%is distinct from old.status%'
                                   from pg_proc where proname='guard_waitlist_status_transition')),
    ('w12_res_guard_trigger',     exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
                                   where c.relname='reservations' and t.tgname='trg_guard_reservation_status')),
    ('w12_res_seated_oneway',     (select pg_get_functiondef(oid) like '%seated%'
                                    and pg_get_functiondef(oid) like '%completed%'
                                   from pg_proc where proname='guard_reservation_status_transition')),
    ('w12_booking_idempotent',    (select pg_get_functiondef(oid) like '%90 seconds%'
                                   from pg_proc where proname='book_reservation_guest')),
    ('w12_no_double_table',       exists(select 1 from pg_constraint
                                   where conname='no_double_booking' and contype='x')),
    ('w13_service_role_timeout',  (select coalesce(array_to_string(rolconfig, ','), '') like '%statement_timeout=%'
                                    and coalesce(array_to_string(rolconfig, ','), '') like '%idle_in_transaction_session_timeout=%'
                                   from pg_roles where rolname='service_role')),
    ('w13_idle_tx_killed',        (select coalesce(array_to_string(rolconfig, ','), '') like '%idle_in_transaction_session_timeout=%'
                                   from pg_roles where rolname='authenticator')),
    ('w13_watchdog_exists',       exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                   where n.nspname='public' and p.proname='watchdog_kill_stuck')),
    ('w13_watchdog_locked',       not has_function_privilege('anon','public.watchdog_kill_stuck()','EXECUTE')
                                 and not has_function_privilege('authenticated','public.watchdog_kill_stuck()','EXECUTE')),
    ('w13_watchdog_cron_alive',   exists(select 1 from cron.job
                                   where jobname='watchdog-stuck' and active)),
    ('w13_pgnet_selfrestart',     (select pg_get_functiondef(oid) like '%worker_restart%'
                                   from pg_proc where proname='send_platform_alerts')),
    ('w14_client_errors_rls',     (select relrowsecurity from pg_class where relname='client_errors')),
    ('w14_log_err_locked',        not has_function_privilege('anon','public.log_client_error(text,text,text)','EXECUTE')
                                 and not has_function_privilege('authenticated','public.log_client_error(text,text,text)','EXECUTE')
                                 and has_function_privilege('service_role','public.log_client_error(text,text,text)','EXECUTE')),
    ('w14_client_errors_wired',   (select pg_get_functiondef(oid) like '%client_errors%'
                                   from pg_proc where proname='check_platform_health')
                                 and (select pg_get_functiondef(oid) like '%client_errors%'
                                   from pg_proc where proname='send_platform_alerts')),
    ('w14_log_err_flood_capped',  (select pg_get_functiondef(oid) like '%500%'
                                   from pg_proc where proname='log_client_error')),
    ('w15_backup_fn_exists',      exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                   where n.nspname='public' and p.proname='backup_snapshot_daily')),
    ('w15_backup_cron_alive',     exists(select 1 from cron.job
                                   where jobname='backup-snapshot' and active)),
    ('w15_backup_fresh',          exists(select 1 from backup.snap_log
                                   where at > now() - interval '25 hours' and total_rows > 0)),
    ('w16_domain_watch_exists',   exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                   where n.nspname='public' and p.proname='check_domain_expiry')),
    ('w16_domain_cron_alive',     exists(select 1 from cron.job
                                   where jobname='domain-expiry-watch' and active)),
    ('w17_run_checks_locked',     not has_function_privilege('anon','public.run_critical_checks()','EXECUTE')
                                 and not has_function_privilege('authenticated','public.run_critical_checks()','EXECUTE')),
    ('w17_digest_locked',         not has_function_privilege('anon','public.send_platform_status_digest(boolean)','EXECUTE')
                                 and not has_function_privilege('authenticated','public.send_platform_status_digest(boolean)','EXECUTE')),
    ('w17_digest_cron_alive',     exists(select 1 from cron.job
                                   where jobname='operator-status-digest' and active)),
    ('w18_waitlist_cap_col',      exists(select 1 from information_schema.columns
                                   where table_schema='public' and table_name='branch_settings'
                                     and column_name='max_waitlist_size')),
    ('w18_waitlist_cap_ranged',   exists(select 1 from pg_constraint
                                   where conname='branch_settings_max_waitlist_size_range')),
    ('w18_waitlist_cap_wired',    (select pg_get_functiondef(oid) like '%max_waitlist_size%'
                                    and pg_get_functiondef(oid) like '%P0010%'
                                   from pg_proc where proname='join_waitlist_guest')),
    ('w19_reception_context_wired',(select pg_get_functiondef(oid) like '%is_vip%'
                                     and pg_get_functiondef(oid) like '%no_shows%'
                                     and pg_get_functiondef(oid) like '%customer_restaurant%'
                                    from pg_proc where proname='staff_branch_queue')),
    ('w19_reception_context_locked',(not has_function_privilege('anon','public.staff_branch_queue(uuid)','EXECUTE')
                                     and has_function_privilege('authenticated','public.staff_branch_queue(uuid)','EXECUTE'))),
    ('w20_telegram_cmd_locked',  (not has_function_privilege('anon','public.telegram_command(text,text,text)','EXECUTE')
                                  and not has_function_privilege('authenticated','public.telegram_command(text,text,text)','EXECUTE'))),
    ('w20_digest_not_flooding',  (select schedule = '0 4,18 * * *' from cron.job where jobname='operator-status-digest')),
    ('w21_visual_integrity_locked', (not has_function_privilege('anon','public.check_visual_integrity()','EXECUTE')
                                   and not has_function_privilege('anon','public.alert_visual_integrity()','EXECUTE')
                                   and not has_function_privilege('authenticated','public.check_visual_integrity()','EXECUTE'))),
    ('w21_visual_cron_alive',     (select schedule = '*/15 * * * *' and active
                                     from cron.job where jobname='visual-integrity')),
    ('w22_hours_close_grace',      (select pg_get_functiondef(oid) like '%branch_open_by_hours(s.opening_hours, now() - interval%'
                                    from pg_proc where proname='expire_stale_waitlist')),
    ('w22_closed_waiters_locked',  (not has_function_privilege('anon','public.alert_closed_branch_with_waiters()','EXECUTE')
                                   and not has_function_privilege('authenticated','public.alert_closed_branch_with_waiters()','EXECUTE'))),
    ('w22_closed_waiters_cron_alive', (select schedule = '*/5 * * * *' and active
                                        from cron.job where jobname='closed-branch-waiters')),
    ('w22_cap_default_present',    (select column_default = '50' from information_schema.columns
                                    where table_schema='public' and table_name='branch_settings'
                                      and column_name='max_waitlist_size')),
    ('w22_no_active_branch_uncapped', not exists(
                                    select 1 from public.branches b
                                    join public.branch_settings s on s.branch_id = b.id
                                   where b.is_active and s.max_waitlist_size is null)),
    ('w23_hours_constraint_live', exists(select 1 from pg_constraint
                                    where conname='branch_settings_hours_sane')),
    ('w23_no_zero_window_hours',  not exists(select 1 from public.branch_settings
                                    where public.hours_have_bad_window(opening_hours))),
    ('w23_no_branch_open_24h',    not exists(
                                    select 1 from public.branches b
                                    join public.restaurants r on r.id = b.restaurant_id
                                    join public.branch_settings s on s.branch_id = b.id
                                    cross join generate_series(0,6) as d
                                   where b.is_active and r.is_active and not r.is_canary
                                     and s.accepts_waitlist
                                     and b.created_at < now() - interval '24 hours'
                                     and public.branch_open_hours_on(s.opening_hours, d) > 20)),
    ('w26_queue_paused_col',      exists(select 1 from information_schema.columns
                                    where table_schema='public' and table_name='branch_settings'
                                      and column_name='queue_paused')),
    ('w26_join_honors_pause',     (select pg_get_functiondef(oid) like '%P0011%'
                                    from pg_proc where proname='join_waitlist_guest' and pronargs=5)),
    ('w26_pause_rpc_locked',      (not has_function_privilege('anon','public.set_branch_queue_paused(uuid,boolean)','EXECUTE')
                                   and has_function_privilege('authenticated','public.set_branch_queue_paused(uuid,boolean)','EXECUTE'))),
    ('w26_pause_resets_at_dawn',  (select command like '%queue_paused%'
                                    from cron.job where jobname='reset-manual-flags')),
    ('w27_pause_default_closed', (select column_default = 'true' from information_schema.columns
                                   where table_schema='public' and table_name='branch_settings'
                                     and column_name='queue_paused')),
    ('w27_dawn_closes_not_opens', (select command like '%queue_paused = true%'
                                    from cron.job where jobname='reset-manual-flags')),
    ('w29_dawn_spares_canary', (select command like '%is_canary%'
                                  from cron.job where jobname='reset-manual-flags')),
    ('w29_canary_queue_open', not exists (
        select 1 from public.branch_settings s
          join public.branches b on b.id = s.branch_id
          join public.restaurants r on r.id = b.restaurant_id
         where r.is_canary and s.queue_paused)),
    ('w30_no_permission_drift', (public.check_permission_drift() ->> 'ok')::boolean),
    ('w28_push_log_names_sub', (select pg_get_functiondef(oid) like '%''sub'',  s.id%'
                                  from pg_proc where proname='log_push_sends')),
    ('w33_alert_channel_delivering', not exists (
        select 1 from public.alert_outbox
         where status = 'failed' and created_at > now() - interval '24 hours')),
    ('w29_waitlist_published_realtime', exists (select 1 from pg_publication_tables
          where pubname='supabase_realtime' and schemaname='public'
            and tablename='waitlist_entries')),
    ('w38_live_pos_not_null',   not exists(
                                   select 1 from public.waitlist_entries w
                                    where w.status in ('waiting','notified')
                                      and w."position" is null)),
    ('w39_live_pos_constraint',  exists(select 1 from pg_constraint
                                   where conname='waitlist_live_pos_unique'
                                     and contype='x' and condeferrable)),
    ('w40_pos_trigger_per_zone', (select pg_get_functiondef(oid) like '%zone is not distinct from new.zone%'
                                   from pg_proc where proname='set_waitlist_position')),
    ('w41_queue_log_trigger',    (select count(*)=1 from pg_trigger t
                                    join pg_class c on c.oid=t.tgrelid
                                   where c.relname='waitlist_entries'
                                     and t.tgname='trg_log_queue_event' and t.tgenabled='O')),
    ('w42_queue_events_rls',     (select relrowsecurity from pg_class where oid='public.queue_events'::regclass)
                                  and exists(select 1 from pg_policies
                                   where schemaname='public' and tablename='queue_events'
                                     and cmd='SELECT' and qual like '%my_branch_ids%')),
    ('w43_queue_events_prunable',exists(select 1 from pg_proc
                                   where proname='prune_queue_events' and pronamespace='public'::regnamespace)
                                  and not exists(select 1 from public.queue_events
                                   where at < now() - interval '35 days')),
    ('w44_restore_waitlist_perm',(select pg_get_functiondef(oid) like '%my_branch_ids_for%'
                                    and pg_get_functiondef(oid) not like '%my_managed_branch_ids%'
                                   from pg_proc where proname='restore_queue_entry'
                                     and pronamespace='public'::regnamespace)),
    ('w47_no_new_anon_secdef', not exists (
        select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.prokind='f' and p.prosecdef
           and has_function_privilege('anon', p.oid, 'EXECUTE')
           and p.proname not in (
             'can_access_branch','has_feature','health_snapshot','is_brand_manager',
             'is_manager_of','is_platform_admin','is_staff_of','my_branch_ids',
             'my_branch_ids_for','my_managed_branch_ids','queue_version',
             'reservation_slots','restaurant_of_branch','staff_can_read_customer',
             'staff_has_perm','tv_queue','waitlist_counts_by_zone',
             'waitlist_counts_for','waitlist_ticket_by_id','waitlist_ticket_status'))),
    ('w48_public_scoped_policies_baseline',
       (select count(*) from pg_policies where schemaname='public'
          and roles::text[] @> array['public']) <= 58),
    ('w49_customer_read_is_perm_mapped',
       (select pg_get_functiondef(oid) ~ 'my_branch_ids_for'
          from pg_proc where proname='staff_can_read_customer'
           and pronamespace='public'::regnamespace)),
    ('w50_ops_tables_sealed_from_clients', not exists (
        select 1 from information_schema.role_table_grants g
         where g.table_schema='public' and g.grantee in ('anon','authenticated')
           and g.table_name in ('platform_admins','push_subscriptions','alert_config',
                                'alert_state','client_errors','alert_outbox','app_salt',
                                'daily_snapshot','phone_lookup_log','rate_limits'))),
    ('w51_report_fns_not_client_executable', not exists (
        select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public'
           and p.proname in ('snapshot_payload','report_flags','report_since_label',
                             'report_window_change','daily_report_text')
           and (has_function_privilege('anon', p.oid, 'EXECUTE')
             or has_function_privilege('authenticated', p.oid, 'EXECUTE')))),
    ('w52_claim_code_full_entropy',
       (select pg_get_functiondef(oid) ~ 'gen_random_bytes'
           and pg_get_functiondef(oid) !~ 'gen_random_uuid'
          from pg_proc where proname='gen_claim_code'
           and pronamespace='public'::regnamespace)),
    ('w53_privileged_actions_audited', not exists (
        select 1 from (values
            ('set_staff_permission','perm:set'),
            ('set_branch_status','branch:status'),
            ('set_branch_join_frozen','branch:join_frozen'),
            ('admin_delete_restaurant','restaurant:delete'),
            ('restore_queue_entry','queue:restore')
          ) as t(fn, act)
         where not exists (select 1 from pg_proc p
                            where p.proname = t.fn
                              and p.pronamespace = 'public'::regnamespace
                              and pg_get_functiondef(p.oid) like '%' || t.act || '%'))),
    ('w54_pii_retention_scheduled',
       exists (select 1 from cron.job where jobname = 'pii-retention' and active)
       and (select pg_get_functiondef(oid) !~ 'full_name = null'
              from pg_proc where proname='run_pii_retention'
               and pronamespace='public'::regnamespace)
       and (select pg_get_functiondef(oid) !~ 'full_name = null'
              from pg_proc where proname='retire_dormant_customers'
               and pronamespace='public'::regnamespace)),
    ('w55_health_canary_phone_subsecond',
       (select position('lpad(floor(random() * 100000000)' in pg_get_functiondef(oid)) > 0
           and position('(extract(epoch from clock_timestamp())::bigint' in pg_get_functiondef(oid)) = 0
          from pg_proc where proname='check_platform_health'
           and pronamespace='public'::regnamespace)),
    ('w56_http_ext_outside_public',
       not exists (select 1 from pg_depend dp
                     join pg_extension ex on ex.oid = dp.refobjid and ex.extname = 'http'
                     join pg_proc pr on pr.oid = dp.objid
                     join pg_namespace ns on ns.oid = pr.pronamespace
                    where dp.refclassid = 'pg_extension'::regclass
                      and dp.classid = 'pg_proc'::regclass
                      and ns.nspname = 'public')
       and not exists (select 1 from pg_proc pr
                        where pr.pronamespace = 'public'::regnamespace
                          and pr.proname in ('check_platform_health','check_visual_integrity',
                                             'check_domain_expiry')
                          and position('public.http' in pg_get_functiondef(pr.oid)) > 0)),
    ('w57_canary_artifacts_bounded',
       exists (select 1 from cron.job where jobname = 'prune-canary-artifacts' and active)
       and (select count(*) from public.customers
             where full_name = 'ÙØ­Øµ Ø¢ÙÙ' and user_id is null) <= 300),
    ('w58_ticket_follows_restore_lineage',
       (select count(*) = 2 from pg_proc pr
         where pr.pronamespace = 'public'::regnamespace
           and pr.proname in ('waitlist_ticket_by_id','waitlist_ticket_status')
           and position('effective_entry_id' in pg_get_functiondef(pr.oid)) > 0)
       and not exists (
         select 1 from public.queue_events ev
          where ev.kind = 'restored' and ev.detail ? 'restored_from'
            and public.effective_entry_id((ev.detail->>'restored_from')::uuid)::text
                = ev.detail->>'restored_from')),
    ('w59_swap_is_sealed_and_zone_safe',
       not has_function_privilege('anon', 'public.swap_queue_positions(uuid,uuid)', 'EXECUTE')
       and (select position('my_branch_ids_for' in pg_get_functiondef(oid)) > 0
               and position('zone is distinct from' in pg_get_functiondef(oid)) > 0
              from pg_proc where proname='swap_queue_positions'
               and pronamespace='public'::regnamespace)),
    ('q20_schema_no_drift',      (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
                                  where n.nspname='public' and c.relkind='r') = 36
                                 and (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                      where n.nspname='public' and p.prokind='f') = 149
                                 and (select count(*) from pg_policies where schemaname='public') = 74
                                 and (select count(*) from pg_constraint c join pg_class r on r.oid=c.conrelid
                                      join pg_namespace n on n.oid=r.relnamespace
                                      where n.nspname='public' and c.contype='f') = 44),
    ('q34_no_calendar_day_predicate', not exists (
        select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.prokind='f'
           and pg_get_functiondef(p.oid) ~ '\(([a-z0-9_]+)\.joined_at at time zone ''Asia/Riyadh''\)::date\s*=\s*\(now\(\) at time zone ''Asia/Riyadh''\)::date')),
    ('w46_no_unbounded_http_post', not exists (
        select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.prokind='f'
           and p.prosrc like '%http_post%'
           and p.prosrc not like '%timeout_milliseconds%'))
  )
  select name, pass from checks;
$function$
;
