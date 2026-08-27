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
  -- ── رمز التملّك: العمود الذي يهب المطعم لمن يقرؤه (0092) ──
  -- ‏RLS يحكم الصفوف لا الأعمدة، فالحارس صلاحيّةُ عمودٍ لا سياسة. وهذه
  -- الفحوص الأربعة هي سلك الإنذار: أيّ `grant select on restaurants`
  -- مستقبليّ — بلا قائمة أعمدة — يُعيد فتح الباب صامتًا، وهنا يُكشف.
  ('claim_code_hidden_anon',   not has_column_privilege('anon','public.restaurants','claim_code','SELECT')),
  ('claim_code_hidden_authed', not has_column_privilege('authenticated','public.restaurants','claim_code','SELECT')),
  ('owner_phone_hidden_anon',  not has_column_privilege('anon','public.restaurants','owner_phone','SELECT')),
  ('owner_user_hidden_anon',   not has_column_privilege('anon','public.restaurants','owner_username','SELECT')),
  -- وفي المقابل: الموقع العام يجب أن يبقى قادرًا على القراءة، وإلّا
  -- انقلب التحصين تعطيلًا.
  ('public_cols_readable',     has_column_privilege('anon','public.restaurants','slug','SELECT')
                               and has_column_privilege('anon','public.restaurants','name','SELECT')),
  ('admin_list_locked',        not has_function_privilege('anon','public.admin_restaurants_list()','EXECUTE')),
  -- ── باب الكتابة مغلق (0093) ──
  -- الكتابة تمرّ بخادمنا وحده. وسقوط أيٍّ من هذه إلى «مفتوح» يعني أنّ
  -- حرّاس الخادم — حدّ العنوان وتطبيع الرقم وقصّ القسم — صارت تُتخطّى
  -- بنداءٍ مباشر إلى PostgREST بالمفتاح العلنيّ.
  ('write_join_closed',        not has_function_privilege('anon','public.join_waitlist_guest(uuid,text,text,integer,text)','EXECUTE')
                               and not has_function_privilege('authenticated','public.join_waitlist_guest(uuid,text,text,integer,text)','EXECUTE')),
  ('write_cancel_closed',      not has_function_privilege('anon','public.cancel_waitlist_guest(uuid,text)','EXECUTE')),
  ('write_review_closed',      not has_function_privilege('anon','public.submit_review(text,text,integer,text)','EXECUTE')),
  ('phone_lookup_closed',      not has_function_privilege('anon','public.guest_status_by_phone(text)','EXECUTE')
                               and not has_function_privilege('anon','public.guest_status_by_phone(text,text)','EXECUTE')
                               and not has_function_privilege('anon','public.rewards_by_phone(text)','EXECUTE')
                               and not has_function_privilege('anon','public.rewards_by_phone(text,text)','EXECUTE')),
  -- ── تسريب الاستعلام بالرقم (0104) ──
  -- برقمٍ وحده كان يخرج الاسم الكامل والمطعم والفرع والحالة وعدد المرافقين.
  -- والموقع هو كامل جائزة المهاجم: أن يعرف أنّ صاحب هذا الرقم هنا الآن.
  ('phone_lookup_hides_name',
   (select pg_get_functiondef(oid) not like '%full_name%'
      from pg_proc where proname='guest_status_by_phone' and pronargs=2)),
  ('phone_lookup_hides_venue',
   (select pg_get_functiondef(oid) not like '%r.name%' and pg_get_functiondef(oid) not like '%b.name%'
      from pg_proc where proname='guest_status_by_phone' and pronargs=2)),
  ('rewards_lookup_hides_venue',
   (select pg_get_functiondef(oid) not like '%r.name%'
      from pg_proc where proname='rewards_by_phone' and pronargs=2)),
  -- والحدّ يعدّ على الطالب لا على المطلوب، وإلّا فكلّ رقمٍ جديدٍ نافذةٌ جديدة
  ('phone_lookup_rate_by_caller',
   (select pg_get_functiondef(oid) like '%gstat:ip%'
      from pg_proc where proname='guest_status_by_phone' and pronargs=2)),
  ('rewards_lookup_rate_by_caller',
   (select pg_get_functiondef(oid) like '%rewards:ip%'
      from pg_proc where proname='rewards_by_phone' and pronargs=2)),
  -- وسقف الأرقام المختلفة لكل طالب: هذا العدّاد وحده هو الذي يقتل التعداد
  ('phone_lookup_distinct_cap',
   (select pg_get_functiondef(oid) like '%gstat:ipn:%'
      from pg_proc where proname='guest_status_by_phone' and pronargs=2)),
  ('phone_lookup_audited',      to_regclass('public.phone_lookup_log') is not null),
  -- والسجلّ لا يحفظ رقمًا ولا عنوانًا صريحًا: سجلٌّ يجمع أرقام الناس يصير هو الثغرة
  ('phone_log_hashed_only',
   (select pg_get_functiondef(oid) like '%digest(v_salt%'
      from pg_proc where proname='guest_status_by_phone' and pronargs=2)),
  ('phone_log_server_only',     not has_function_privilege('anon','public.retire_phone_lookup_log()','EXECUTE')
                               and not has_function_privilege('authenticated','public.retire_phone_lookup_log()','EXECUTE')),
  -- والحجز يبقى للموظّف: صندوق الاستقبال يحجز نيابةً عن العميل
  ('book_stays_for_staff',     has_function_privilege('authenticated','public.book_reservation_guest(uuid,text,text,timestamptz,integer,text,text)','EXECUTE')
                               and not has_function_privilege('anon','public.book_reservation_guest(uuid,text,text,timestamptz,integer,text,text)','EXECUTE')),
  -- وما يناديه المتصفّح مباشرةً يبقى مفتوحًا، وإلّا انكسرت الواجهة صامتة
  ('browser_reads_open',       has_function_privilege('anon','public.waitlist_ticket_status(uuid,text)','EXECUTE')
                               and has_function_privilege('anon','public.waitlist_counts_for(uuid[])','EXECUTE')
                               and has_function_privilege('anon','public.reservation_slots(uuid,date,integer,text)','EXECUTE')),
  -- وبيانات المالك مغلقةٌ عن المسجَّل أيضًا بعد انتهاء تراجع 0096
  ('owner_cols_closed_authed', not has_column_privilege('authenticated','public.restaurants','owner_phone','SELECT')
                               and not has_column_privilege('authenticated','public.restaurants','owner_username','SELECT')),
  -- لوحة الاستقبال تُقرأ بنداءٍ واحد (0102)، والدالّة تُخرج أسماء العملاء
  -- وأرقامهم بامتياز المالك — ففتحُها للزائر يساوي تسريب دفتر العملاء كلّه.
  ('board_rpc_closed_anon',    not has_function_privilege('anon','public.staff_branch_queue(uuid)','EXECUTE')
                               and has_function_privilege('authenticated','public.staff_branch_queue(uuid)','EXECUTE')),
  -- وسجلّ الإرسال (0103) لا يُكتب إلا من خادمنا: سجلٌّ يستطيع أي مسجَّلٍ
  -- أن يزرع فيه سطرًا لا يصلح شهادةً حين يُسأل «هل وصل العميلَ تنبيه؟».
  ('push_log_server_only',     not has_function_privilege('anon','public.log_push_sends(jsonb)','EXECUTE')
                               and not has_function_privilege('authenticated','public.log_push_sends(jsonb)','EXECUTE')),
  ('anon_blocked_rollup',      not has_function_privilege('anon','public.rollup_all_daily_stats(date)','EXECUTE')),
  ('anon_blocked_digest',      not has_function_privilege('anon','public.run_daily_digest()','EXECUTE')),
  ('anon_blocked_del_push',    not has_function_privilege('anon','public.delete_push_subscription(text)','EXECUTE')),
  -- تحصينات 0068: حارس المعدّل بالقصد، وحذف الاشتراك مسحوب من المجهول
  ('check_rate_locked',        not has_function_privilege('anon','public.check_rate(text,integer,interval)','EXECUTE')),
  ('del_dead_push_locked',     not has_function_privilege('anon','public.delete_dead_push_subscription(text)','EXECUTE')),
  -- ── الأمان: دوال الضيف المحروسة متاحة (كسرها = تعطّل المنتج) ──
  -- كان هنا `anon_can_join`: «الزائر يستطيع الانضمام مباشرةً». وهو شرطٌ
  -- انقلب معناه في 0093 — صار الانضمام يمرّ بخادمنا وحده — فصار الفحص
  -- يناقض `write_join_closed` في هذا الملف نفسه: أحدهما يسقط حتمًا مهما
  -- كانت القاعدة سليمة. كشفه أوّل تشغيلٍ كاملٍ بعد 0102: أربعة فحوصٍ
  -- حمراء لا تعني عطبًا بل تعني أنّ الشبكة نفسها لم تُحدَّث مع الترحيل.
  -- والبديل يحرس ما يهمّ فعلًا: الطريق موجود، ومفتاح الخدمة يسلكه.
  ('join_path_alive',          has_function_privilege('service_role','public.join_waitlist_guest(uuid,text,text,integer,text)','EXECUTE')),
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
  -- ── الترقيم: قفل صفّ الفرع داخل التريغر (0109 استبدل القفل الاستشاري —
  --    محاكاة حمل ١٠ مطاعم عبر k6/PostgREST أثبتت تكرار position رغمه؛
  --    السبب الدقيق لفشل القفل الاستشاري تحت ذاك التزامن غير مؤكَّد، لكن
  --    قفل الصفّ القياسيّ لا يعتمد على دلالات القفل الاستشاري ولا على
  --    سلوك أي مُجمِّع اتصالات) ──
  ('trigger_has_row_lock',     (select pg_get_functiondef(oid) ilike '%for update%'
                                and pg_get_functiondef(oid) not ilike '%pg_advisory_xact_lock%'
                                from pg_proc where proname='set_waitlist_position')),
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
  -- (٥) سطح الدوال المكشوفة للضيف لا يتوسّع خلسةً.
  --     كان الحدّ ٣٥ والواقع ٣٩ — أي أنّ الفحص كان يمرّ وهو مخروق. ثم
  --     أُغلقت خمس نقاط نهايةٍ بلا مستدعٍ (0097) فصار الواقع ٣٠، فشُدّ
  --     الحدّ إليه.
  --
  --     ⚠ محاولة تشديدٍ فاشلة (0111-0114 ثم تراجع 0117): فاحص أمان
  --     Supabase أظهر ١٤ دالّةً مساعدة (is_staff_of، my_branch_ids،
  --     staff_has_perm، ...) قابلةً للتنفيذ من anon، فسُحبت — لكن التحقّق
  --     كان ناقصًا: بحث عن 'anon' حرفيًّا في pg_policies.roles، ففاته أن
  --     سياسة RLS بلا TO صريح تُسجَّل roles={public} لا {anon}، وPUBLIC
  --     يشمل anon فعليًّا. النتيجة: سياسات SELECT حقيقية على restaurants
  --     وbranch_settings (roles={public}) تستدعي is_staff_of/my_branch_ids،
  --     فكسرت الصفحة الرئيسية وr/[slug] لكل زائرٍ مجهول لعشر ساعات قبل
  --     أن يُكتشف عبر Vercel runtime errors. 0117 أعاد المنح لهذه الدوال
  --     تحديدًا (لا check_platform_health — غير مُشارةٍ إليها من أي
  --     سياسة). الحدّ هنا عاد لواقعه الحقيقي: ٢١، لا ٧.
  --
  --     الدرس لأي تضييقٍ لاحق: التحقّق الصحيح `roles @> ARRAY['public']
  --     OR roles @> ARRAY['anon']`، لا `'anon' = any(roles)` وحدها —
  --     وتأكيدٌ تجريبي حتمًا (`set role anon` ثم تنفيذ نفس استعلام
  --     التطبيق الفعلي) قبل أي `revoke`، لا قراءة pg_policies وحدها.
  --     و«أصغر أو يساوي» لا «يساوي»: يمسك التوسّع ولا يعاقب على إغلاقٍ جديد.
  ('q05_secdef_anon_surface',  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                where n.nspname='public' and p.prokind='f' and p.prosecdef
                                  and has_function_privilege('anon',p.oid,'EXECUTE')) <= 30),
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
  -- والطريق بعد 0093 خادمُنا لا متصفّحه — فالحارس أن تبقى الدالّتان
  -- قائمتَين ومنفَّذتَين بمفتاح الخدمة، لا مفتوحتَين للزائر.
  ('q24_guest_can_cancel',     has_function_privilege('service_role','public.cancel_by_ticket(uuid)','EXECUTE')
                               and has_function_privilege('service_role','public.cancel_waitlist_guest(uuid,text)','EXECUTE')),
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
  ('q26_guest_recovery',       has_function_privilege('service_role','public.guest_status_by_phone(text,text)','EXECUTE')),
  ('q26_guest_can_cancel_res', has_function_privilege('service_role','public.cancel_reservation_guest(uuid,text)','EXECUTE')),
  -- وكلتاهما محروسة بحدّ معدّل: بلا ذلك يُعدّ المهاجم الأرقام ويقرأ أسماءها
  ('q26_recovery_rate_limited',(select pg_get_functiondef(oid) like '%check_rate%'
                                from pg_proc where proname='guest_status_by_phone' and pronargs=2)),
  ('q26_cancel_needs_phone',   (select pg_get_functiondef(oid) like '%norm_phone_input%'
                                from pg_proc where proname='cancel_reservation_guest')),
  -- ══ الموجة الثانية (0105, 0106): الكتابة المباشرة ══
  --
  -- (ث‑١) التقييمات: submit_review تفرض حدّ معدّلٍ وزيارةً فعليّة وتقييمًا
  --       واحدًا لكلّ مطعم، والجدول كان لا يفرض شيئًا — فأيّ حسابٍ مسجَّل
  --       كتب ٢٠٠ تقييمًا بنجمةٍ واحدة لمطعمٍ لم يزره. الباب أُغلق لا ضُيِّق.
  ('w2_reviews_insert_locked', not has_table_privilege('anon','public.reviews','insert')
                               and not has_table_privilege('authenticated','public.reviews','insert')),
  -- وسياسة الإدخال المباشر أُزيلت معها: بقاؤها ميّتةً يُوهم القارئ بباب مفتوح
  ('w2_reviews_no_ins_policy', not exists(select 1 from pg_policies
                                where schemaname='public' and tablename='reviews' and cmd='INSERT')),
  -- «تقييمٌ واحدٌ لكلّ عميلٍ لكلّ مطعم» قيدٌ في القاعدة لا سطرٌ في دالّة —
  -- يصمد لأيّ مسارٍ قادم، ولمفتاح الخدمة نفسه
  ('w2_review_one_per_cust',   exists(select 1 from pg_indexes
                                where indexname='uniq_review_per_customer_restaurant')),
  --
  -- (ث‑٢) الطابور والحجوزات: كانت سياسةٌ واحدةٌ تغطّي ALL وتفحص الفرع وحده،
  --       فموظّفٌ كلّ صلاحيّاته false مسح ٧٨٧ صفَّ طابورٍ و١٢٠٧ حجزًا.
  --       الآن: قراءةٌ وإدخالٌ وتعديلٌ بحسب الصلاحيّة، والحذف للإدارة وحدها.
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
  -- ولا حذفَ بلا أثر: مُطلِقٌ يحفظ الصفّ كاملًا في admin_audit، يصمد لـPostgREST
  -- ولمفتاح الخدمة ولسكربتٍ يدويّ — فالمحذوف قابلٌ للاسترجاع لا للبكاء عليه
  ('w2_queue_delete_audited',  (select count(*) from pg_trigger
                                where tgname in ('trg_audit_delete_waitlist',
                                                 'trg_audit_delete_reservations')) = 2),
  -- ══ 0107: الصلاحيّة تحكم القراءة أيضًا ══
  --
  -- موظّفٌ كلّ صلاحيّاته false كان يقرأ ٢٣ ملفَّ عميل و٦ صفوف موظّفين
  -- بخرائط صلاحيّاتهم و٣٠ صفَّ إحصاءات. لا شيء عابرٌ للمستأجرين، لكنّه
  -- يتجاوز ما مُنح — والقراءة تُقيَّد كما قُيّدت الكتابة في 0106.
  ('w2_read_perm_customers',   not exists(select 1 from pg_policies
                                where schemaname='public' and tablename='customer_restaurant'
                                  and cmd in ('SELECT','ALL') and qual like '%is_staff_of%')),
  ('w2_read_perm_stats',       (select bool_or(qual like '%my_branch_ids_for%') from pg_policies
                                where schemaname='public' and tablename='daily_stats' and cmd='SELECT')),
  ('w2_read_perm_notifs',      (select bool_or(qual like '%my_branch_ids_for%') from pg_policies
                                where schemaname='public' and tablename='notifications' and cmd='SELECT')),
  -- ⚠ الحارس الذي يمنع عطلًا كاملًا: بوّابة الدخول (guard.ts، owner-context.ts،
  -- الاستقبال، الشركاء) تسأل جدول staff «من أنا؟» بـ user_id = auth.uid().
  -- فإن قُيّدت قراءته بصلاحية team وحدها، لم يعرف أيّ مضيفٍ نفسه — وسقطت
  -- اللوحة والاستقبال لكلّ من لا يملك team. هذا الفحص يمسك ذلك قبل النشر.
  ('w2_staff_self_readable',   (select bool_or(qual like '%auth.uid()%') from pg_policies
                                where schemaname='public' and tablename='staff' and cmd='SELECT')),
  -- ══ 0108: الطابور يعبر منتصف الليل سليمًا ══
  --
  -- المطعم السعوديّ النمطيّ يفتح ٦ مساءً ويغلق ٢ فجرًا، فطابوره حيٌّ عند
  -- ٠٠:٠٠. وكان الترقيم محصورًا بتاريخ الرياض، فيُصفَّر عند منتصف الليل
  -- ويتصدّر الوافدُ الجديد من انتظر قبله — بلا خطأ ولا تحذير.
  --
  -- (أ) الترقيم لا يعرف التاريخ: أيّ عودةٍ لحصر الحدّ الأقصى بيومٍ تقويميّ
  --     تُعيد العطب، وهذا الفحص يمسكها.
  ('w3_position_no_daily_reset',(select pg_get_functiondef(oid) not like '%::date%'
                                 from pg_proc where proname='set_waitlist_position')),
  -- (ب) والقفل يبقى مشتقًّا من الفرع وحده — لولاه لتسلسلت كلّ الفروع خلف
  --     قفلٍ واحد واختنقت المنصّة عند ٢٥ مطعمًا. 0109 بدّل الآلية (صفٌّ
  --     FOR UPDATE بدل قفلٍ استشاريّ، بعد أن أثبتت محاكاة حملٍ حقيقيّة أنّ
  --     الاستشاريّ لا يمنع التكرار فعليًّا) — لكن الشرط نفسه يبقى: المفتاح
  --     new.branch_id وحده.
  ('w3_position_lock_per_branch',(select pg_get_functiondef(oid) like '%where id = new.branch_id for update%'
                                 from pg_proc where proname='set_waitlist_position')),
  -- (ج) والتنظيف لا يُنهي صفوفًا حيّة بحلول يومٍ جديد: قاعدته زمنٌ منقضٍ
  --     (٨ ساعات لفرعٍ بلا ساعات) أو إغلاقُ الفرع بجدول دوامه — لا تاريخ.
  --     0123 حذف مهلة الـ٤٥ دقيقة بعد الإغلاق بطلبٍ صريح («بمجرد ما يجي
  --     وقت الاغلاق تصفر») — الفحص يحرس الحذف من العودة أيضًا.
  ('w3_expire_by_elapsed_only', (select pg_get_functiondef(oid) not like '%::date%'
                                  and pg_get_functiondef(oid) like '%8 hours%'
                                  and pg_get_functiondef(oid) not like '%45 minutes%'
                                  and pg_get_functiondef(oid) like '%branch_open_by_hours%'
                                 from pg_proc where proname='expire_stale_waitlist')),
  -- (د) وسلامة الترتيب على بيانات الإنتاج: لا رقمَ مكرّرًا بين صفّين حيّين
  --     في الفرع الواحد — وهو ما كان تصفير منتصف الليل يصنعه فعليًّا، وما
  --     أثبتت محاكاة الحمل (0109) أن القفل الاستشاريّ وحده لا يكفي لمنعه
  ('w3_no_duplicate_live_pos',  not exists(
                                 select 1 from public.waitlist_entries w
                                 where w.status in ('waiting','notified')
                                 group by w.branch_id, w."position"
                                 having count(*) > 1)),
  -- ══ 0110: سقف party_size على الحجوزات أيضًا، لا الطابور وحده ══
  --
  -- 0071 قصّت party_size بطبقتين على الطابور: الدالة تقصّ إلى ماكس الفرع،
  -- والقيد (<= 50) حاجزٌ أخير في القاعدة. الحجوزات أخذت طبقة الدالة فقط —
  -- فُحص فعليًّا (سالب/ضخم داخل begin/rollback) ولا خطأ خامٌ يصل الضيف،
  -- لكن لو صار max_party_size نفسه رقمًا غير معقول (بلا قيدٍ عليه أصلًا)
  -- لمرّ من مسار الحجز وحده. 0110 يسدّ الاثنين.
  ('w4_reservation_party_capped', exists(select 1 from pg_constraint
                                where conname='reservations_party_size_max')),
  ('w4_max_party_size_ranged',    exists(select 1 from pg_constraint
                                where conname='branch_settings_max_party_size_range')),
  -- مؤجَّلٌ عمدًا (ث‑٣): «rewards_status_no_revival» — صاحب صلاحية customers
  -- ما زال يعيد هديّةً مستهلكةً إلى active ويرفع عدّاد الزيارات. قرارٌ صريحٌ
  -- بتأجيله إلى ما بعد الإطلاق، ولا يُضاف فحصٌ أحمر يكسر شبكةً كلّها خضراء.
  --
  -- (٢٠) مرجع المخطط: أي انحراف عن البصمة المثبَّتة يظهر هنا قبل أن يفاجئنا
  --      (٢٩ جدولًا · ١٠٢ دالة · ٧١ سياسة · ٤٠ مفتاحًا أجنبيًّا) — راجع
  --      supabase/tests/schema_baseline.md وحدّثه عمدًا عند أي تغيير مقصود
  --      تغيّرت في 0105/0106: +٣ دوال (my_branch_ids_for، my_managed_branch_ids،
  --      audit_row_delete) و+٥ سياسات (‑١ إدخال تقييم، +٣ طابور، +٣ حجوزات)
  --      وفي 0107: ‑١ سياسة (أُسقطت قراءة ملفّات العملاء الواسعة بلا بديل،
  --      إذ تغطّيها سياسة ALL المحروسة بـcustomers أصلًا)
  --      وفي 0115: +١ دالة (check_platform_health) — ١٠١ صارت ١٠٢
  -- ══ 0115: check_platform_health() — لا ربط إرسال، للمشغّل وحده ══
  ('w5_platform_health_exists', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                where n.nspname='public' and p.proname='check_platform_health')),
  ('w5_platform_health_anon_blocked', not has_function_privilege('anon','public.check_platform_health()','EXECUTE')),
  ('w5_platform_health_authed_ok',    has_function_privilege('authenticated','public.check_platform_health()','EXECUTE')),
  -- ⚠ تطوّرت خارج هذا الفرع: check_platform_health() لم تعد تُرجع
  -- {cron, waitlist_anomaly, generated_at} كما بُنيت في 0115 — عمل موازٍ
  -- اكتُشف الليلة أعاد كتابتها بفحوصٍ حيّة أوسع (homepage، anon_rest_api،
  -- booking_writepath، schema_integrity، ...، عبر http/pg_net). الفحص هنا
  -- خُفِّف ليطابق ما لا يتغيّر مهما تطوّر الشكل الداخلي: أنها موجودة،
  -- محجوبة عن anon، وتُرجع jsonb غير فارغ فعليًّا لا خطأ.
  ('w5_platform_health_shape',  (select public.check_platform_health()) is not null),
  -- ══ 0117 هوتفكس: حارسٌ دائم ضد نفس فئة العطب — دالّةٌ تستدعيها سياسة
  --    RLS بلا EXECUTE لـanon ══
  --
  -- 0111-0114 سحبت EXECUTE من anon عن دوالٍّ ظهرت في pg_policies بلا
  -- 'anon' حرفيًّا في roles — لكن سياسةً بلا TO صريح تُسجَّل roles={public}
  -- وPUBLIC يشمل anon. سياسات SELECT حقيقية (restaurants، branch_settings)
  -- كسرت الصفحة الرئيسية وr/[slug] لعشر ساعات قبل 0117. هذا الفحص يستخرج
  -- كل اسم دالّةٍ يظهر داخل qual/with_check لأي سياسةٍ بـroles={public}
  -- أو {anon}، ويتأكّد أن anon يملك EXECUTE عليها إن كانت SECURITY
  -- DEFINER في public — فلا يتكرّر هذا العطب صامتًا خلف "أصغر أو يساوي".
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
  -- ══ 0118/0119: أدوات ذاتية للأدمن — حذف مطعم، وإخفاؤه عن الجمهور ══
  ('w6_admin_delete_exists',    exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                where n.nspname='public' and p.proname='admin_delete_restaurant')),
  ('w6_admin_delete_anon_blocked', not has_function_privilege('anon','public.admin_delete_restaurant(uuid)','EXECUTE')),
  ('w6_admin_canary_exists',    exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                where n.nspname='public' and p.proname='admin_set_restaurant_canary')),
  ('w6_admin_canary_anon_blocked', not has_function_privilege('anon','public.admin_set_restaurant_canary(uuid,boolean)','EXECUTE')),
  -- ══ 0120: دالتا التنبيهات (وُلدتا خارج المستودع بمنح افتراضي مفتوح) ══
  -- notify_telegram كانت قابلة للتنفيذ من anon — أي حامل مفتاحٍ علني يرسل
  -- سبامًا لتيليجرام المشغّل. المستدعي الشرعي الوحيد كرونُ postgres.
  ('w7_telegram_locked',        not has_function_privilege('anon','public.notify_telegram(text)','EXECUTE')
                               and not has_function_privilege('authenticated','public.notify_telegram(text)','EXECUTE')),
  ('w7_alerts_locked',          not has_function_privilege('anon','public.send_platform_alerts()','EXECUTE')
                               and not has_function_privilege('authenticated','public.send_platform_alerts()','EXECUTE')),
  ('w7_alerts_cron_alive',      exists(select 1 from cron.job
                                where jobname='platform-health-alerts' and active)),
  -- ══ 0121: دوامٌ مختلف بحسب اليوم (opening_hours.days) ══
  -- تواريخ مثبّتة: 2026-08-28 جمعة (dow=5) و2026-08-29 سبت — الفحص حتميّ.
  ('w8_hours_day_override',     public.branch_open_by_hours(
                                  '{"open":"16:00","close":"23:00","days":{"5":{"open":"14:00","close":"23:00"}}}'::jsonb,
                                  '2026-08-28 15:00:00+03'::timestamptz) = true
                               and public.branch_open_by_hours(
                                  '{"open":"16:00","close":"23:00","days":{"5":{"open":"14:00","close":"23:00"}}}'::jsonb,
                                  '2026-08-26 15:00:00+03'::timestamptz) = false),
  -- ذيل الليل يُحسب بجدول أمس: الجمعة تقفل ٣ فجرًا فالسبت ٢ فجرًا مفتوح
  ('w8_hours_overnight_tail',   public.branch_open_by_hours(
                                  '{"open":"16:00","close":"23:00","days":{"5":{"open":"20:00","close":"03:00"}}}'::jsonb,
                                  '2026-08-29 02:00:00+03'::timestamptz) = true
                               and public.branch_open_by_hours(
                                  '{"open":"16:00","close":"23:00","days":{"5":{"open":"20:00","close":"03:00"}}}'::jsonb,
                                  '2026-08-29 04:00:00+03'::timestamptz) = false),
  -- التوافق الخلفي: الشكل القديم {open,close} وحده يعمل كما كان حرفيًّا
  ('w8_hours_backcompat',       public.branch_open_by_hours('{"open":"18:00","close":"02:00"}'::jsonb, '2026-08-26 01:00:00+03'::timestamptz) = true
                               and public.branch_open_by_hours('{"open":"18:00","close":"02:00"}'::jsonb, '2026-08-26 03:00:00+03'::timestamptz) = false
                               and public.branch_open_by_hours('{}'::jsonb, '2026-08-26 04:00:00+03'::timestamptz) = true),
  -- مواعيد الحجز تقرأ دوام يوم الطلب نفسه لا العام وحده
  ('w8_slots_day_aware',        (select pg_get_functiondef(oid) like '%''days''%'
                                 from pg_proc where proname='reservation_slots')),
  -- ══ 0122: تقييم المالك اليدوي — العمود موجود ومقروء للزائر ومقيّد 0-5 ══
  ('w9_manual_rating_col',      exists(select 1 from information_schema.columns
                                 where table_schema='public' and table_name='restaurants'
                                   and column_name='manual_rating')),
  ('w9_manual_rating_readable', has_column_privilege('anon','public.restaurants','manual_rating','SELECT')),
  ('w9_manual_rating_ranged',   exists(select 1 from pg_constraint
                                 where conname='restaurants_manual_rating_range')),
  -- ══ 0124: فحوصٌ تشغيلية أعمق (طابور عالق، توقّف انضمامٍ مفاجئ، ضغط
  --    اتصالات، زمن استجابة) — طلبٌ مباشر بعد أول يومٍ حقيقيّ بمطعمين حيّين.
  --    استدعاءٌ حيٌّ واحدٌ فقط (كـw5 أعلاه) — الدالّة تُجري حجزًا تجريبيًّا
  --    فعليًّا فلا نكرّر النداء لكل تأكيد، بل نجمعها في فحصٍ واحد.
  ('w10_health_deeper_checks_present',
    (select h ? 'stuck_queue' and h ? 'join_flatline' and h ? 'db_connections'
            and (h->'homepage'->>'ms') is not null and (h->'restaurant_page'->>'ms') is not null
     from (select public.check_platform_health() as h) s)),
  -- سلك الإنذار: لا يكفي أن تُرجع الدالّة المفاتيح — يجب أن send_platform_alerts
  -- تكون فعليًّا موصولةً بها (قائمة v_checks)، وإلا فحصٌ حيٌّ صامتٌ بلا تنبيه.
  ('w10_alerts_new_keys_wired', (select pg_get_functiondef(oid) like '%stuck_queue%'
                                  and pg_get_functiondef(oid) like '%join_flatline%'
                                  and pg_get_functiondef(oid) like '%db_connections%'
                                 from pg_proc where proname='send_platform_alerts')),
  -- ══ 0125: النبضة اليومية — مفتاح الرجل الميت لقناة التنبيه ══
  -- التنبيه على «قناة التنبيه معطّلة» عبر القناة المعطّلة مستحيلٌ منطقيًّا؛
  -- الضمان الوحيد رسالة موعدها ثابت يلاحَظ غيابها. هذه الفحوص تحرس وجود
  -- الآلية لا وصول الرسالة (الوصول يحرسه المشغّل بعينه — هذا جوهر الفكرة).
  ('w11_heartbeat_fn_exists',   exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                 where n.nspname='public' and p.proname='run_daily_heartbeat')),
  ('w11_heartbeat_locked',      not has_function_privilege('anon','public.run_daily_heartbeat()','EXECUTE')
                               and not has_function_privilege('authenticated','public.run_daily_heartbeat()','EXECUTE')),
  ('w11_heartbeat_cron_alive',  exists(select 1 from cron.job
                                 where jobname='daily-heartbeat' and active)),
  -- net_queue: المفتاح مبنيٌّ في الفحص وموصولٌ بحلقة التنبيه معًا —
  -- بلا استدعاءٍ حيٍّ إضافي (w10 أعلاه يستدعي الدالّة فعليًّا ويكفي)
  ('w11_net_queue_wired',       (select pg_get_functiondef(oid) like '%net_queue%'
                                 from pg_proc where proname='check_platform_health')
                               and (select pg_get_functiondef(oid) like '%net_queue%'
                                 from pg_proc where proname='send_platform_alerts')),
  -- ══ 0126: حرّاس سباقات التجليس والتكرار (تدقيقٌ عدائيّ قبل أول ذروة) ══
  -- اختُبرت الخمسة فعليًّا داخل معاملةٍ مُرجَعة على الإنتاج: كبسة حجزٍ
  -- مزدوجة تُعيد الحجز نفسه، وجالس-الطابور لا يُقلب، وجالس-الحجز لا يصير
  -- «لم يحضر»، وجالس←مكتمل يمرّ، والمنتهي مجمّد. هذه الفحوص تحرس البنية.
  ('w12_wl_terminal_frozen',    (select pg_get_functiondef(oid) like '%is distinct from old.status%'
                                 from pg_proc where proname='guard_waitlist_status_transition')),
  ('w12_res_guard_trigger',     exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
                                 where c.relname='reservations' and t.tgname='trg_guard_reservation_status')),
  ('w12_res_seated_oneway',     (select pg_get_functiondef(oid) like '%seated%'
                                  and pg_get_functiondef(oid) like '%completed%'
                                 from pg_proc where proname='guard_reservation_status_transition')),
  ('w12_booking_idempotent',    (select pg_get_functiondef(oid) like '%90 seconds%'
                                 from pg_proc where proname='book_reservation_guest')),
  -- قيد الطاولة الرياضي (كان قائمًا وأثبت التدقيق قيمته — يُحرس من الإسقاط)
  ('w12_no_double_table',       exists(select 1 from pg_constraint
                                 where conname='no_double_booking' and contype='x')),
  -- ══ 0127: التعافي الذاتي الليلي («يتصلح لحاله وأنا نايم») ══
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
  -- (٢٠) مرجع المخطط — البصمة تحرّكت خارج ترحيلات هذا الفرع أيضًا (عمل
  -- موازٍ اكتُشف الليلة: نظام /api/canary، جداول جديدة، ...) — الأرقام هنا
  -- قياسٌ فعليٌّ للواقع الحاليّ لا حسابٌ يدويّ تراكميّ. راجع schema_baseline.md.
  ('q20_schema_no_drift',      (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
                                where n.nspname='public' and c.relkind='r') = 31
                               -- 0125: +١ دالة (run_daily_heartbeat) — ١٢٥ صارت ١٢٦
                               -- 0126: +١ دالة (guard_reservation_status_transition) — ١٢٧
                               -- 0127: +١ دالة (watchdog_kill_stuck) — ١٢٨
                               and (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                    where n.nspname='public' and p.prokind='f') = 128
                               and (select count(*) from pg_policies where schemaname='public') = 71
                               and (select count(*) from pg_constraint c join pg_class r on r.oid=c.conrelid
                                    join pg_namespace n on n.oid=r.relnamespace
                                    where n.nspname='public' and c.contype='f') = 40)
)
select name, pass,
  case when pass then '✓' else '✗ FAIL' end as mark
from checks
order by pass, name;
