-- ============================================================================
--  تحديث run_critical_checks() ليطابق critical_checks.sql بعد 0133 —
--  ثلاثة فحوصٍ جديدة (w18_*) تحرس سقف حجم الطابور: العمود موجود، القيد
--  يمنع رقمًا غير موجب، والدالّة موصولةٌ به فعليًّا (لا إعدادٌ ميّت).
-- ============================================================================

create or replace function public.run_critical_checks()
returns table(name text, pass boolean)
language sql
security definer
set search_path to ''
as $function$
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
    ('guard_cancel_unknown',     public.cancel_by_ticket('00000000-0000-0000-0000-000000000000') = false),
    ('guard_review_bad_rating',  public.submit_review('eficto','0506089164',9,null)->>'error' = 'invalid_rating'),
    ('guard_review_no_visit',    public.submit_review('eficto',
                                   '05' || lpad((floor(random()*100000000))::bigint::text, 8, '0'),
                                   5, null)->>'error' = 'no_visit'),
    ('guard_push_wrong_phone',   public.save_push_subscription('00000000-0000-0000-0000-000000000000','0500000000','https://x.invalid/e','k','a') = false),
    ('norm_arabic',              public.norm_phone_input('٠٥٠٦٠٨٩١٦٤') = '506089164'),
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
                                                       'reviews','branches','staff')
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
    ('q24_guest_can_cancel',     has_function_privilege('service_role','public.cancel_by_ticket(uuid)','EXECUTE')
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
                                   group by w.branch_id, w."position"
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
    ('q20_schema_no_drift',      (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
                                  where n.nspname='public' and c.relkind='r') = 32
                                 and (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                      where n.nspname='public' and p.prokind='f') = 133
                                 and (select count(*) from pg_policies where schemaname='public') = 71
                                 and (select count(*) from pg_constraint c join pg_class r on r.oid=c.conrelid
                                      join pg_namespace n on n.oid=r.relnamespace
                                      where n.nspname='public' and c.contype='f') = 40)
  )
  select name, pass from checks;
$function$;
