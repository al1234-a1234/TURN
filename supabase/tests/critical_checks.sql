-- ============================================================================
--  شبكة الفحوص الحرجة — تُشغَّل على الإنتاج بعد كل ترحيل.
--  قراءة فقط (أي كتابة تجريبية داخل معاملة تُرجَع). كل صف = فحص واحد،
--  pass=false يعني كسرًا يجب إيقاف النشر عنده.
--  التشغيل: نفّذ الملف كاملًا عبر Supabase MCP أو psql — النتيجة جدول واحد.
-- ============================================================================
with checks(name, pass) as (
  values
  -- ── الأمان: الدوال الخطرة مقفلة عن الضيف ──
  -- المولّد الوهمي أُسقط كليًّا (0091) — والغياب أقوى من المنع: دالّةٌ
  -- محذوفة لا تُمنح سهوًا في ترحيلٍ لاحق ولا تُنادى من لوحة المزوّد.
  ('demo_generator_dropped',   to_regprocedure('public.demo_live_activity()') is null),
  ('anon_blocked_rollup',      not has_function_privilege('anon','public.rollup_all_daily_stats(date)','EXECUTE')),
  ('anon_blocked_digest',      not has_function_privilege('anon','public.run_daily_digest()','EXECUTE')),
  ('anon_blocked_del_push',    not has_function_privilege('anon','public.delete_push_subscription(text)','EXECUTE')),
  -- تحصينات 0068: حارس المعدّل بالقصد، وحذف الاشتراك مسحوب من المجهول
  ('check_rate_locked',        not has_function_privilege('anon','public.check_rate(text,integer,interval)','EXECUTE')),
  ('del_dead_push_locked',     not has_function_privilege('anon','public.delete_dead_push_subscription(text)','EXECUTE')),
  -- ── الأمان: دوال الضيف المحروسة متاحة (كسرها = تعطّل المنتج) ──
  ('anon_can_join',            has_function_privilege('anon','public.join_waitlist_guest(uuid,text,text,integer,text)','EXECUTE')),
  ('anon_can_ticket',          has_function_privilege('anon','public.waitlist_ticket_status(uuid,text)','EXECUTE')),
  -- ── حرّاس الدوال: مدخلات فاسدة تُرفض ──
  ('guard_confirm_unknown',    public.confirm_attendance('00000000-0000-0000-0000-000000000000') = false),
  ('guard_cancel_unknown',     public.cancel_by_ticket('00000000-0000-0000-0000-000000000000') = false),
  ('guard_review_bad_rating',  public.submit_review('eficto','0506089164',9,null)->>'error' = 'invalid_rating'),
  -- رقم عشوائي كل تشغيل: الفحص لا يستهلك ميزانية حدٍّ ثابتة فيسقط بعد ٥ تشغيلات
  ('guard_review_no_visit',    public.submit_review('eficto',
                                 '05' || lpad((floor(random()*100000000))::bigint::text, 8, '0'),
                                 5, null)->>'error' = 'no_visit'),
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
                                                     'restaurant_photos',
                                                     'reviews','branches','staff')
                                   and (qual like '%is_staff_of%' or qual like '%staff_has_perm%' or qual like '%is_manager_of%')
                                   and qual not like '%can_access_branch%'
                                   and qual not like '%my_branch_ids%')),
  ('branch_guard_in_push_rpc', (select pg_get_functiondef(oid) like '%can_access_branch%'
                                from pg_proc where proname='queue_push_targets')),
  ('branch_guard_in_customer', (select pg_get_functiondef(oid) like '%my_branch_ids%'
                                from pg_proc where proname='staff_can_read_customer')),
  -- ── إغلاق حلقات القيمة: الرموز والاعتماد ──
  ('reward_code_trigger',      exists(select 1 from pg_trigger where tgname='trg_reward_code')),
  ('no_active_reward_no_code', not exists(select 1 from public.customer_rewards
                                          where status='active' and (code is null or btrim(code)=''))),
  ('staff_redeem_exists',      exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                      where n.nspname='public' and p.proname='staff_redeem_reward')),
  -- العروض حُذفت كليًّا (0055) — نتأكد ألّا يعود جدولها بالخطأ
  ('offers_fully_removed',     not exists(select 1 from information_schema.tables
                                          where table_schema='public' and table_name in ('offers','offer_redemptions'))),
  ('anon_blocked_self_redeem', not has_function_privilege('anon','public.redeem_customer_reward(uuid,text)','EXECUTE')),
  ('validate_before_limit',    (select position('invalid_rating' in pg_get_functiondef(oid))
                                     < position('check_rate' in pg_get_functiondef(oid))
                                from pg_proc where proname='submit_review')),
  -- «my_restaurant_status» حُذفت في 0068 (تعداد هويات بلا مستدعٍ) — نتأكّد ألّا تعود
  ('my_restaurant_status_gone',to_regprocedure('public.my_restaurant_status(text,text)') is null),
  ('anon_can_health',          has_function_privilege('anon','public.health_snapshot()','EXECUTE')),
  -- ── المرحلة أ (0048): جهاز الحماية بلا WAL وسقف الفرع من إعداداته ──
  ('rate_limits_unlogged',     (select relpersistence = 'u' from pg_class c
                                join pg_namespace n on n.oid=c.relnamespace
                                where n.nspname='public' and c.relname='rate_limits')),
  -- ── منظومة «استعمال الهدية» (0066-0068) ──
  ('winback_table',            exists(select 1 from information_schema.tables
                                      where table_schema='public' and table_name='winback_settings')),
  ('armed_at_col',             exists(select 1 from information_schema.columns
                                      where table_schema='public' and table_name='customer_rewards' and column_name='armed_at')),
  ('rewards_by_phone_guarded', (select pg_get_functiondef(oid) like '%check_rate%'
                                from pg_proc where proname='rewards_by_phone')),
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
  -- ── يوم الرياض في التجميع والعدّادات ──
  ('rollup_riyadh_day',        (select pg_get_functiondef(oid) like '%Asia/Riyadh%' from pg_proc where proname='rollup_daily_stats')),
  ('digest_riyadh_day',        (select pg_get_functiondef(oid) like '%Asia/Riyadh%' from pg_proc where proname='run_daily_digest')),
  -- «counts_riyadh_day» حُذف عمدًا: 0057 جعل العدّادات حيّة بالحالة لا بيوم
  -- الرياض (كي لا يتبخّر الطابور عند منتصف الليل)، فالفحص القديم انعكس ضدّه.
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
  -- الرفع يعتمد على قراءة الحاوية — RLS بلا سياسة هنا = فشل كل رفع بصمت (0061)
  ('bucket_readable',          exists(select 1 from pg_policies
                                      where schemaname='storage' and tablename='buckets'
                                        and cmd='SELECT' and 'authenticated' = any(roles))),
  -- upsert التخزين = INSERT ON CONFLICT، وتحكيمه يشترط سياسة SELECT على
  -- objects — غيابها أفشل «كل» رفع صورة رغم صحة سياسة الرفع نفسها (0063)
  ('objects_readable',         exists(select 1 from pg_policies
                                      where schemaname='storage' and tablename='objects'
                                        and cmd='SELECT' and 'authenticated' = any(roles))),
  -- ── التذكرة الحيّة: position = ahead + 1 لكل صف حيّ ──
  ('live_rank_math',           not exists(
                                 select 1 from public.waitlist_entries w
                                 join public.customers c on c.id = w.customer_id
                                 cross join lateral public.waitlist_ticket_status(w.id, c.phone) t
                                 where w.status in ('waiting','notified')
                                   and t."position" is distinct from t.ahead + 1)),

-- ══════════════════════════════════════════════════════════════════════════
--  العشرون الثقيلة — كل فحص هنا يحرس نتيجةً اكتُشفت في تدقيق العشرين سؤالًا.
--  الغرض ألّا يعود عطبٌ أُصلح، ولا ينكشف ما أُغلق، بلا أن ينتبه أحد.
-- ══════════════════════════════════════════════════════════════════════════

  -- (١) دالة تقاعد العملاء: كانت مكشوفة لـ anon بلا حارس — تمحو بيانات الجميع
  ('q01_retire_locked_anon',   not has_function_privilege('anon','public.retire_dormant_customers(integer)','EXECUTE')),
  ('q02_retire_locked_auth',   not has_function_privilege('authenticated','public.retire_dormant_customers(integer)','EXECUTE')),
  -- (٣) نسخة الهدايا القديمة كانت تُرجع رمز الهديّة لأي رقم يُكتب
  ('q03_old_rewards_locked',   not has_function_privilege('anon','public.get_customer_rewards(text)','EXECUTE')),
  -- (٤) RLS على كل جدول بلا استثناء — جدول واحد بلا حماية = القاعدة مكشوفة
  ('q04_rls_every_table',      not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                                          where n.nspname='public' and c.relkind='r' and not c.relrowsecurity)),
  -- (٥) سطح الدوال المكشوفة للضيف لا يتوسّع خلسةً (٣٥ اليوم)
  ('q05_secdef_anon_surface',  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                where n.nspname='public' and p.prokind='f' and p.prosecdef
                                  and has_function_privilege('anon',p.oid,'EXECUTE')) <= 35),
  -- (٦) مهلة الاستعلام: بدونها استعلامٌ جامح من لوحةٍ واحدة يُبطئ كل المطاعم
  ('q06_anon_stmt_timeout',    (select coalesce((select option_value from pg_options_to_table(rolconfig)
                                                 where option_name='statement_timeout'),'') <> ''
                                from pg_roles where rolname='anon')),
  -- (٧) سقف عدد الأشخاص — كان بلا حدّ أعلى يفسد متوسّطات التقارير
  ('q07_party_size_capped',    exists(select 1 from pg_constraint where conname='waitlist_entries_party_size_max')),
  -- (٨،٩) حدود الطول: اسم العميل يكتبه ضيف مجهول وكان بلا سقف في أي طبقة
  ('q08_customer_name_len',    exists(select 1 from pg_constraint where conname='customers_full_name_len')),
  ('q09_menu_text_len',        exists(select 1 from pg_constraint where conname='menu_items_name_len')),
  -- (١٠) التخزين: صور فقط — SVG/HTML مرفوعان يُنفَّذان كسكربت من نطاقنا
  ('q10_storage_images_only',  not exists(select 1 from storage.buckets
                                          where allowed_mime_types is null
                                             or 'image/svg+xml' = any(allowed_mime_types)
                                             or 'text/html'     = any(allowed_mime_types))),
  -- (١١) سقف حجم الرفع — بدونه ملفٌ ضخم واحد يفجّر التكلفة
  ('q11_storage_size_capped',  not exists(select 1 from storage.buckets where file_size_limit is null)),
  -- (١٢،١٣،١٤) الموظّف المفصول يفقد وصوله فورًا: الفحص في كل طلب لا في الرمز
  ('q12_staff_checks_active',  (select pg_get_functiondef(oid) ilike '%is_active%' from pg_proc where proname='is_staff_of')),
  ('q13_perm_checks_active',   (select pg_get_functiondef(oid) ilike '%is_active%' from pg_proc where proname='staff_has_perm')),
  ('q14_branches_check_active',(select pg_get_functiondef(oid) ilike '%is_active%' from pg_proc where proname='my_branch_ids')),
  -- (١٥) سقف ازدحام الفرع ٦٠٠/دقيقة — عند ٦٠ كان يُرفض ٤٤٠ عميلًا في الافتتاح
  ('q15_join_burst_600',       (select pg_get_functiondef(oid) like '%600, interval ''1 minute''%'
                                from pg_proc where proname='join_waitlist_guest')),
  -- (١٦،١٧) دالة الانضمام تقصّ المدخلات بهدوء فلا يُرفض عميل حقيقي
  ('q16_join_clamps_party',    (select pg_get_functiondef(oid) like '%least(greatest%' from pg_proc where proname='join_waitlist_guest')),
  ('q17_join_clamps_name',     (select pg_get_functiondef(oid) like '%left(trim(p_full_name), 120)%' from pg_proc where proname='join_waitlist_guest')),
  -- (١٨) وظائف الليل كلها قائمة — سقوط واحدة يوقف التقارير أو الاسترجاع بصمت
  ('q18_cron_jobs_present',    (select count(*) from cron.job) >= 7),
  -- (١٩) سلامة إحالية: لا صفّ طابور بلا فرع (حذف الفرع صار ناعمًا لحفظ التاريخ)
  ('q19_no_orphan_waitlist',   not exists(select 1 from public.waitlist_entries w
                                          left join public.branches b on b.id = w.branch_id
                                          where b.id is null)),
  -- (٢١) التنظيف التلقائي مضبوط على الجداول عالية الدوران — العتبة الافتراضية
  --      نسبةٌ مئوية تتباعد كلّما كبر الجدول، أي أن الحاجة تزيد والتنظيف يقلّ
  ('q21_autovacuum_tuned',     (select coalesce(array_to_string(reloptions,','),'') like '%autovacuum_vacuum_scale_factor=0.02%'
                                from pg_class where relname='waitlist_entries')),
  -- (٢٢) حارس آلة الحالات: لا يُعاد إحياء دورٍ منتهٍ (اختُبرت الانتقالات الأربعة)
  ('q22_status_guard',         exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
                                      where c.relname='waitlist_entries'
                                        and t.tgname='trg_guard_waitlist_status')),
  -- (٢٣،٢٤) أهداف الإشعار لا تُسلَّم لعميلٍ مجهول: كانت تُعيد بيانات اشتراك كل
  --          من في الفرع (endpoint = بصمة جهازٍ ثابتة)، وticket_cancel لا تطلب
  --          رقمًا أصلًا — يكفيها صفٌّ مُلغى، وهو شرطٌ يصنعه المهاجم بنفسه عبر
  --          cancel_by_ticket. الخادم يستدعيهما الآن بمفتاح الخدمة وحده.
  ('q23_push_targets_locked',  not has_function_privilege('anon','public.queue_push_targets_after_cancel(uuid,text)','EXECUTE')
                               and not has_function_privilege('anon','public.queue_push_targets_after_ticket_cancel(uuid)','EXECUTE')),
  -- وما يجب أن يبقى للضيف يبقى: إلغاء دوره بنفسه (كسره = عميلٌ حبيس طابور)
  ('q24_guest_can_cancel',     has_function_privilege('anon','public.cancel_by_ticket(uuid)','EXECUTE')
                               and has_function_privilege('anon','public.cancel_waitlist_guest(uuid,text)','EXECUTE')),
  -- (٢٥) فرعٌ جديد يولد بأقسامه: بدونها كان كل مطعمٍ جديد يُفتح له فرع
  --      لا يستطيع عميلُه أخذ دورٍ أبدًا — الحارس يكتب NULL في عمودٍ
  --      NOT NULL فيموت الإدخال بلا رسالة مفهومة (0082).
  ('q25_new_branch_gets_zones', exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
                                where c.relname='branches' and t.tgname='t_branch_default_zones')),
  ('q25_no_branch_without_zone',not exists(
                                 select 1 from public.branches b
                                 where b.is_active
                                   and not exists(select 1 from public.branch_zones z
                                                  where z.branch_id=b.id and z.is_active))),
  -- والحارس لا يمحو قيمةً لا بديل لها
  ('q25_guard_keeps_value',    (select pg_get_functiondef(oid) like '%if v_fallback is null then return new; end if;%'
                                from pg_proc where proname='enforce_zone_belongs_to_branch')),
  -- (٢٦) استرجاع الضيف بالرقم: التخزين المحلّي يضيع بتثبيت التطبيق أو
  --      بتبديل الجهاز، والحجز لم يكن يُسترجَع ولا يُلغى أصلًا (0084).
  ('q26_guest_recovery',       has_function_privilege('anon','public.guest_status_by_phone(text)','EXECUTE')),
  ('q26_guest_can_cancel_res', has_function_privilege('anon','public.cancel_reservation_guest(uuid,text)','EXECUTE')),
  -- وكلتاهما محروسة بحدّ معدّل: بلا ذلك يُعدّ المهاجم الأرقام ويقرأ أسماءها
  ('q26_recovery_rate_limited',(select pg_get_functiondef(oid) like '%check_rate%'
                                from pg_proc where proname='guest_status_by_phone')),
  ('q26_cancel_needs_phone',   (select pg_get_functiondef(oid) like '%norm_phone_input%'
                                from pg_proc where proname='cancel_reservation_guest')),
  -- (٢٠) مرجع المخطط: أي انحراف عن البصمة المثبَّتة يظهر هنا قبل أن يفاجئنا
  --      (٢٤ جدولًا · ٧٤ دالة · ٦١ سياسة · ٣٩ مفتاحًا أجنبيًّا) — راجع
  --      supabase/tests/schema_baseline.md وحدّثه عمدًا عند أي تغيير مقصود
  ('q20_schema_no_drift',      (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
                                where n.nspname='public' and c.relkind='r') = 24
                               and (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                    where n.nspname='public' and p.prokind='f') = 74
                               and (select count(*) from pg_policies where schemaname='public') = 61
                               and (select count(*) from pg_constraint c join pg_class r on r.oid=c.conrelid
                                    join pg_namespace n on n.oid=r.relnamespace
                                    where n.nspname='public' and c.contype='f') = 39)
)
select name, pass,
  case when pass then '✓' else '✗ FAIL' end as mark
from checks
order by pass, name;
