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
  ('guard_review_no_visit',    public.submit_review('eficto','0500000001',5,null)->>'error' = 'no_visit'),
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
