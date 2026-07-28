-- ============================================================================
--  شبكة الفحوص الحرجة — تُشغَّل على الإنتاج بعد كل ترحيل.
--  قراءة فقط (أي كتابة تجريبية داخل معاملة تُرجَع). كل صف = فحص واحد،
--  pass=false يعني كسرًا يجب إيقاف النشر عنده.
--  التشغيل: نفّذ الملف كاملًا عبر Supabase MCP أو psql — النتيجة جدول واحد.
-- ============================================================================
with checks(name, pass) as (
  values
  -- ── الأمان: الدوال الخطرة مقفلة عن الضيف ──
  ('anon_blocked_demo',        not has_function_privilege('anon','public.demo_live_activity()','EXECUTE')),
  ('anon_blocked_rollup',      not has_function_privilege('anon','public.rollup_all_daily_stats(date)','EXECUTE')),
  ('anon_blocked_digest',      not has_function_privilege('anon','public.run_daily_digest()','EXECUTE')),
  ('anon_blocked_slow_hours',  not has_function_privilege('anon','public.run_slow_hours()','EXECUTE')),
  ('anon_blocked_del_push',    not has_function_privilege('anon','public.delete_push_subscription(text)','EXECUTE')),
  ('auth_blocked_demo',        not has_function_privilege('authenticated','public.demo_live_activity()','EXECUTE')),
  -- ── الأمان: دوال الضيف المحروسة متاحة (كسرها = تعطّل المنتج) ──
  ('anon_can_join',            has_function_privilege('anon','public.join_waitlist_guest(uuid,text,text,integer,text)','EXECUTE')),
  ('anon_can_ticket',          has_function_privilege('anon','public.waitlist_ticket_status(uuid,text)','EXECUTE')),
  ('anon_can_checkin',         has_function_privilege('anon','public.public_checkin(text,text,text,uuid)','EXECUTE')),
  ('anon_can_review',          has_function_privilege('anon','public.submit_review(text,text,integer,text)','EXECUTE')),
  -- ── حرّاس الدوال: مدخلات فاسدة تُرفض ──
  ('guard_confirm_unknown',    public.confirm_attendance('00000000-0000-0000-0000-000000000000') = false),
  ('guard_cancel_unknown',     public.cancel_by_ticket('00000000-0000-0000-0000-000000000000') = false),
  ('guard_review_bad_rating',  public.submit_review('eficto','0506089164',9,null)->>'error' = 'invalid_rating'),
  -- رقم عشوائي كل تشغيل: الفحص لا يستهلك ميزانية حدٍّ ثابتة فيسقط بعد ٥ تشغيلات
  ('guard_review_no_visit',    public.submit_review('eficto',
                                 '05' || lpad((floor(random()*100000000))::bigint::text, 8, '0'),
                                 5, null)->>'error' = 'no_visit'),
  ('guard_checkin_bad_phone',  public.public_checkin('eficto','123',null,null)->>'error' = 'invalid_phone'),
  ('guard_push_wrong_phone',   public.save_push_subscription('00000000-0000-0000-0000-000000000000','0500000000','https://x.invalid/e','k','a') = false),
  -- ── تطبيع الرقم: كل الصيغ تتساوى ──
  ('norm_arabic',              public.norm_phone_input('٠٥٠٦٠٨٩١٦٤') = '506089164'),
  ('norm_intl',                public.norm_phone_input('+966 506 089 164') = '506089164'),
  ('norm_plain',               public.norm_phone_input('0506089164') = '506089164'),
  -- ── البنية: فهارس المسارات الساخنة موجودة ──
  ('idx_phone_norm',           exists(select 1 from pg_indexes where indexname='idx_customers_phone_norm')),
  ('idx_waitlist_active',      exists(select 1 from pg_indexes where indexname='idx_waitlist_active')),
  -- ── الترقيم: القفل الاستشاري داخل التريغر ──
  ('trigger_has_lock',         (select pg_get_functiondef(oid) ilike '%pg_advisory_xact_lock%' from pg_proc where proname='set_waitlist_position')),
  -- ── سلامة فصل الفروع: لا صفوف بلا فرع ولا إحالات عابرة ──
  ('no_null_branch_menu',      not exists(select 1 from public.menu_items where branch_id is null)),
  ('no_null_branch_offers',    not exists(select 1 from public.offers where branch_id is null)),
  ('no_cross_branch_refs',     not exists(select 1 from public.menu_items i join public.menu_categories c on c.id=i.category_id where c.branch_id<>i.branch_id)),
  ('branch_matches_restaurant',not exists(select 1 from public.menu_items i join public.branches b on b.id=i.branch_id where b.restaurant_id<>i.restaurant_id)),
  -- ── عزل الفرانشايز: كل سياسة موظّفين على جدول يحمل branch_id تفحص الفرع ──
  ('branch_guard_exists',      exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                      where n.nspname='public' and p.proname='can_access_branch')),
  ('branch_rls_everywhere',    not exists(
                                 select 1 from pg_policies
                                 where schemaname='public'
                                   and tablename in ('waitlist_entries','reservations','tables','branch_settings',
                                                     'notifications','daily_stats','menu_categories','menu_items',
                                                     'offers','restaurant_photos','checkins','checkin_settings',
                                                     'reviews','offer_redemptions','branches','staff')
                                   and (qual like '%is_staff_of%' or qual like '%staff_has_perm%' or qual like '%is_manager_of%')
                                   and qual not like '%can_access_branch%'
                                   and qual not like '%my_branch_ids%')),
  ('branch_guard_in_push_rpc', (select pg_get_functiondef(oid) like '%can_access_branch%'
                                from pg_proc where proname='queue_push_targets')),
  ('branch_guard_in_customer', (select pg_get_functiondef(oid) like '%my_branch_ids%'
                                from pg_proc where proname='staff_can_read_customer')),
  -- ── إغلاق حلقات القيمة: الرموز والاعتماد والعروض ──
  ('reward_code_trigger',      exists(select 1 from pg_trigger where tgname='trg_reward_code')),
  ('no_active_reward_no_code', not exists(select 1 from public.customer_rewards
                                          where status='active' and (code is null or btrim(code)=''))),
  ('staff_redeem_exists',      exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                      where n.nspname='public' and p.proname='staff_redeem_reward')),
  ('claim_offer_guarded',      (select pg_get_functiondef(oid) like '%check_rate%' and pg_get_functiondef(oid) like '%per_customer_limit%'
                                from pg_proc where proname='claim_offer')),
  ('anon_blocked_self_redeem', not has_function_privilege('anon','public.redeem_customer_reward(uuid,text)','EXECUTE')),
  ('validate_before_limit',    (select position('invalid_rating' in pg_get_functiondef(oid))
                                     < position('check_rate' in pg_get_functiondef(oid))
                                from pg_proc where proname='submit_review')),
  -- ── «وضعي مع هذا المطعم» (0046): متاح للضيف ومحروس بحدّ المعدّل ──
  ('anon_can_status',          has_function_privilege('anon','public.my_restaurant_status(text,text)','EXECUTE')),
  ('status_rate_guarded',      (select pg_get_functiondef(oid) like '%check_rate%'
                                from pg_proc where proname='my_restaurant_status')),
  -- ── قواعد المسح (0045): الفوري موجود، وصف لكل فرع، والتريغر يخلقه ──
  ('scan_grants_instant',      (select pg_get_functiondef(oid) like '%instant_enabled%'
                                from pg_proc where proname='public_checkin')),
  ('scan_settings_every_branch', not exists(
                                 select 1 from public.branches b
                                 where not exists (select 1 from public.checkin_settings cs where cs.branch_id = b.id))),
  ('scan_settings_trigger',    exists(select 1 from pg_trigger where tgname='trg_default_checkin_settings')),
  -- ── الطبقات المعرَّفة من المالك (0047): مصدر ترقية واحد للمسارين ──
  ('tier_fn_exists',           exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                      where n.nspname='public' and p.proname='tier_for_visits')),
  ('tier_in_scan_path',        (select pg_get_functiondef(oid) like '%tier_for_visits%'
                                from pg_proc where proname='public_checkin')),
  ('tier_in_seat_path',        (select pg_get_functiondef(oid) like '%tier_for_visits%'
                                from pg_proc where proname='on_waitlist_status_change')),
  ('tier_config_col',          exists(select 1 from information_schema.columns
                                      where table_schema='public' and table_name='loyalty_programs' and column_name='tier_config')),
  -- ── المرحلة أ (0048): جهاز الحماية بلا WAL وسقف الفرع من إعداداته ──
  ('rate_limits_unlogged',     (select relpersistence = 'u' from pg_class c
                                join pg_namespace n on n.oid=c.relnamespace
                                where n.nspname='public' and c.relname='rate_limits')),
  ('branch_limit_configurable',(select pg_get_functiondef(oid) like '%scan_hourly_limit%'
                                from pg_proc where proname='public_checkin')),
  -- ── يوم الرياض في التجميع والعدّادات ──
  ('rollup_riyadh_day',        (select pg_get_functiondef(oid) like '%Asia/Riyadh%' from pg_proc where proname='rollup_daily_stats')),
  ('digest_riyadh_day',        (select pg_get_functiondef(oid) like '%Asia/Riyadh%' from pg_proc where proname='run_daily_digest')),
  ('counts_riyadh_day',        (select pg_get_functiondef(oid) like '%Asia/Riyadh%' from pg_proc where proname='waitlist_counts')),
  ('visit_idempotency_col',    exists(select 1 from information_schema.columns
                                      where table_schema='public' and table_name='waitlist_entries' and column_name='visit_counted_at')),
  ('uniq_guest_phone',         exists(select 1 from pg_indexes where indexname='uniq_customers_phone_guest')),
  ('uniq_live_entry',          exists(select 1 from pg_indexes where indexname='uniq_waitlist_live_customer_branch')),
  -- ── مستوى العلامة: ما لا يجوز لمدير فرع أن يمسّه ──
  ('brand_guard_exists',       exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                      where n.nspname='public' and p.proname='is_brand_manager')),
  ('brand_only_restaurant',    (select qual like '%is_brand_manager%' from pg_policies
                                where schemaname='public' and tablename='restaurants'
                                  and policyname='manager or admin updates restaurant')),
  ('brand_only_insights',      (select bool_and(qual like '%is_brand_manager%') from pg_policies
                                where schemaname='public' and tablename='owner_insights')),
  ('campaign_branch_scoped',   (select pg_get_functiondef(oid) like '%caller_branch_id%'
                                from pg_proc where proname='grant_reward_to_segment')),
  -- ── RLS مفعّل على الجداول الحسّاسة ──
  ('rls_customers',            (select relrowsecurity from pg_class where relname='customers')),
  ('rls_waitlist',             (select relrowsecurity from pg_class where relname='waitlist_entries')),
  ('rls_push_subs',            (select relrowsecurity from pg_class where relname='push_subscriptions')),
  -- ── التذكرة الحيّة: position = ahead + 1 لكل صف حيّ ──
  ('live_rank_math',           not exists(
                                 select 1 from public.waitlist_entries w
                                 join public.customers c on c.id = w.customer_id
                                 cross join lateral public.waitlist_ticket_status(w.id, c.phone) t
                                 where w.status in ('waiting','notified')
                                   and t."position" is distinct from t.ahead + 1))
)
select name, pass,
  case when pass then '✓' else '✗ FAIL' end as mark
from checks
order by pass, name;
