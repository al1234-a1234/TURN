-- ════════ شبكة عزل المستأجرين ════════
--
-- في القاعدة مطعمٌ واحد. وثلاثٌ وستّون سياسة عزلٍ لم تُختبر ولا واحدةٌ
-- منها ضدّ مستأجرٍ ثانٍ — لأنّه لا يوجد «ثانٍ» يُختبر ضدّه. فكلّ ثغرةٍ
-- تُسرّب بيانات مطعمٍ إلى مطعمٍ آخر هي اليوم غير مرئيّةٍ أصلًا، وتُولد
-- مرئيّةً لحظة دخول المطعم الخامس والعشرين.
--
-- فهذا الملفّ يصنع «ب» كاملًا داخل معاملةٍ تُلغى، ثم يسأل ثلاث هويّاتٍ
-- حقيقيّة — ضيفٌ، ومضيفُ «أ» المربوط بفرعٍ واحد، ومالكُ «أ» — عن كلّ
-- جدولٍ فيه بيانات مستأجر: هل ترى صفًّا من «ب»؟ وهل تستطيع الكتابة فيه؟
--
-- ويفرّق عمدًا بين نوعين، لأنّ الخلط بينهما يُنتج إمّا إنذارًا كاذبًا
-- أو طمأنينةً كاذبة:
--   • «سرّي»   — لا يراه غير أهله بحال: العملاء، الطابور، الحجوزات،
--                الطاقم، الإحصاءات، الهدايا، الشرائح، الطاولات…
--   • «دليلٌ عام» — يراه الناس بالتصميم: اسم المطعم، فروعه، قائمته،
--                صوره، تقييماته المنشورة. وفيه نختبر شيئين: ألّا يُكتب،
--                وألّا تتسرّب معه أعمدةٌ ليست للعرض.
--
-- التشغيل:
--   psql "$SUPABASE_DB_URL" -f supabase/tests/isolation_checks.sql
-- ولا يترك أثرًا: الملفّ كلّه معاملةٌ واحدة تنتهي بـ rollback.

begin;

set local statement_timeout = '120s';

create temp table iso_result(
  id      serial,
  who     text,
  chk     text,
  pass    boolean,
  detail  text
) on commit drop;

-- الفحوص تعمل بأدوار anon/authenticated، فتحتاج إذن الكتابة في جدول النتائج
grant insert, select on iso_result to anon, authenticated;
grant usage, select on sequence iso_result_id_seq to anon, authenticated;

-- ── مِسبار القراءة: ينجح إذا رأى صفرًا، أو مُنع بالصلاحية ──
create function pg_temp.expect_none(p_who text, p_chk text, p_sql text)
returns void language plpgsql as $fn$
declare n bigint;
begin
  execute p_sql into n;
  insert into iso_result(who, chk, pass, detail)
    values (p_who, p_chk, coalesce(n,0) = 0,
            case when coalesce(n,0) = 0 then 'صفر' else n || ' صفًّا مسرَّبًا' end);
exception when insufficient_privilege then
  insert into iso_result(who, chk, pass, detail) values (p_who, p_chk, true, 'مرفوض بالصلاحية');
end $fn$;

-- ── مِسبار القراءة المقصودة: ينجح إذا رأى شيئًا (دليلٌ عام) ──
create function pg_temp.expect_some(p_who text, p_chk text, p_sql text)
returns void language plpgsql as $fn$
declare n bigint;
begin
  execute p_sql into n;
  insert into iso_result(who, chk, pass, detail)
    values (p_who, p_chk, coalesce(n,0) > 0, coalesce(n,0) || ' صفًّا (مقصود)');
exception when others then
  insert into iso_result(who, chk, pass, detail) values (p_who, p_chk, false, 'انكسر: ' || sqlstate);
end $fn$;

-- ── مِسبار الكتابة: ينجح إذا لم يتأثّر صفّ، أو مُنع ──
create function pg_temp.expect_blocked(p_who text, p_chk text, p_sql text)
returns void language plpgsql as $fn$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  insert into iso_result(who, chk, pass, detail)
    values (p_who, p_chk, n = 0,
            case when n = 0 then 'لم يتأثّر صفّ' else n || ' صفًّا كُتب!' end);
exception when others then
  insert into iso_result(who, chk, pass, detail) values (p_who, p_chk, true, 'مرفوض: ' || sqlstate);
end $fn$;

do $iso$
declare
  -- ثلاث هويّات حقيقيّة في auth.users
  u_own_a uuid := gen_random_uuid();
  u_hst_a uuid := gen_random_uuid();
  u_own_b uuid := gen_random_uuid();

  tag   text := substr(md5(clock_timestamp()::text), 1, 8);

  r_a uuid; r_b uuid;          -- مطعمان
  br_a1 uuid; br_a2 uuid; br_b uuid;  -- فروع («أ» فرعان ليُختبر حصر المضيف)
  cu_a uuid; cu_b uuid;        -- عميلان
  cat_b uuid;                  -- قسم قائمة «ب»
  wl_b uuid; rs_b uuid;        -- صفّ طابور وحجز في «ب»

  jwt_own_a text; jwt_hst_a text; jwt_own_b text;
begin
  ---------------------------------------------------------------
  -- (أ) بناء مستأجرَين كاملَين
  ---------------------------------------------------------------
  insert into auth.users(id) values (u_own_a), (u_hst_a), (u_own_b);

  insert into public.restaurants(owner_id, name, slug, is_active, owner_username, owner_phone, email, claim_code)
    values (u_own_a, 'عزل-أ-' || tag, 'iso-a-' || tag, true, 'ownera' || tag, '0500000001', 'a@iso.test', 'AAAA' || upper(tag))
    returning id into r_a;
  insert into public.restaurants(owner_id, name, slug, is_active, owner_username, owner_phone, email, claim_code)
    values (u_own_b, 'عزل-ب-' || tag, 'iso-b-' || tag, true, 'ownerb' || tag, '0500000002', 'b@iso.test', 'BBBB' || upper(tag))
    returning id into r_b;

  insert into public.branches(restaurant_id, name, is_active) values (r_a, 'فرع أ١', true) returning id into br_a1;
  insert into public.branches(restaurant_id, name, is_active) values (r_a, 'فرع أ٢', true) returning id into br_a2;
  insert into public.branches(restaurant_id, name, is_active) values (r_b, 'فرع ب',  true) returning id into br_b;

  -- المالك يملك العلامة كلّها؛ والمضيف محصورٌ في فرعٍ واحدٍ من «أ»
  insert into public.staff(user_id, restaurant_id, branch_id, role, is_active)
    values (u_own_a, r_a, null,  'owner', true),
           (u_hst_a, r_a, br_a1, 'host',  true),
           (u_own_b, r_b, null,  'owner', true);

  insert into public.customers(full_name, phone) values ('عميل أ', '05' || substr(tag,1,7) || '1') returning id into cu_a;
  insert into public.customers(full_name, phone) values ('عميل ب', '05' || substr(tag,1,7) || '2') returning id into cu_b;

  -- صفٌّ واحدٌ في كلّ جدولٍ يحمل بيانات مستأجر — لـ«ب».
  -- ‏`on conflict` و`update` لا `insert`: مُطلِقاتٌ تصنع الإعدادات والأقسام
  -- مع الفرع، فمحاولة إنشائها ثانيةً تصطدم بقيد التفرّد.
  insert into public.branch_zones(branch_id, key, name) values (br_b, 'inside', 'داخلي')
    on conflict (branch_id, key) do nothing;
  update public.branch_settings set accepts_waitlist = true where branch_id = br_b;

  insert into public.waitlist_entries(branch_id, customer_id, party_size, status)
    values (br_b, cu_b, 2, 'waiting') returning id into wl_b;
  insert into public.reservations(branch_id, customer_id, party_size, reserved_at, status)
    values (br_b, cu_b, 2, now() + interval '2 days', 'confirmed') returning id into rs_b;

  -- سجلّ حركة الطابور لـ«ب» (0169). يُزرع صراحةً كي لا يكون «صفر» الفحص
  -- تاليًا مجرّد غيابِ بيانات: الشاهد أدناه يتحقّق من وجوده أوّلًا.
  insert into public.queue_events(branch_id, entry_id, customer_id, kind, zone, from_rank)
    values (br_b, wl_b, cu_b, 'cancelled', 'inside', 1);

  insert into public.customer_restaurant(restaurant_id, customer_id) values (r_b, cu_b);
  insert into public.customer_rewards(restaurant_id, customer_id, title) values (r_b, cu_b, 'هديّة ب');
  insert into public.customer_segments(restaurant_id, name) values (r_b, 'شريحة ب');
  insert into public.daily_stats(branch_id, stat_date) values (br_b, current_date);
  insert into public.notifications(branch_id, channel, template) values (br_b, 'sms', 'قالب ب');
  insert into public.owner_insights(restaurant_id, kind, title) values (r_b, 'test', 'رؤية ب');
  -- المفتاح مرتبطٌ بفهرس الوحدات، فنستعير وحدةً قائمة لا نخترع واحدة
  insert into public.restaurant_features(restaurant_id, module_key)
    select r_b, key from public.feature_modules limit 1;
  insert into public.tables(branch_id, label, seats) values (br_b, 'ط-ب', 4);
  insert into public.winback_settings(restaurant_id) values (r_b);
  insert into public.reviews(restaurant_id, branch_id, rating, is_published) values (r_b, br_b, 5, true);
  insert into public.restaurant_photos(restaurant_id, branch_id, url) values (r_b, br_b, 'https://iso.test/b.jpg');
  insert into public.menu_categories(restaurant_id, branch_id, name) values (r_b, br_b, 'قسم ب') returning id into cat_b;
  insert into public.menu_items(restaurant_id, branch_id, category_id, name, is_available)
    values (r_b, br_b, cat_b, 'صنف ب المسوّدة', false);

  jwt_own_a := json_build_object('sub', u_own_a, 'role', 'authenticated')::text;
  jwt_hst_a := json_build_object('sub', u_hst_a, 'role', 'authenticated')::text;
  jwt_own_b := json_build_object('sub', u_own_b, 'role', 'authenticated')::text;

  ---------------------------------------------------------------
  -- (ب-٠) الشاهد — قبل أن نصدّق «صفرًا» واحدًا
  --
  -- كلّ فحصٍ بعد هذا ينجح إذا رأى صفرًا. وصفرٌ له سببان: عزلٌ سليم،
  -- أو صفوفُ «ب» لم تُخلق أصلًا. والثاني يجعل الشبكة كلّها مسرحيّةً
  -- خضراء تُثبت لا شيء. فنُثبت أوّلًا — بصلاحيةٍ كاملة، بلا RLS —
  -- أنّ ما نبحث عن غيابه موجودٌ فعلًا.
  ---------------------------------------------------------------
  insert into iso_result(who, chk, pass, detail)
  select 'شاهد', 'صفوف «ب» موجودة قبل الفحص', bool_and(n > 0),
         string_agg(t || '=' || n, '، ' order by t)
    from (
      select 'عملاء' t,   count(*) n from public.customers where id = cu_b
      union all select 'طابور',    count(*) from public.waitlist_entries where branch_id = br_b
      union all select 'سجلّ',     count(*) from public.queue_events where branch_id = br_b
      union all select 'حجوزات',   count(*) from public.reservations where branch_id = br_b
      union all select 'طاقم',     count(*) from public.staff where restaurant_id = r_b
      union all select 'هدايا',    count(*) from public.customer_rewards where restaurant_id = r_b
      union all select 'شرائح',    count(*) from public.customer_segments where restaurant_id = r_b
      union all select 'إحصاءات',  count(*) from public.daily_stats where branch_id = br_b
      union all select 'تنبيهات',  count(*) from public.notifications where branch_id = br_b
      union all select 'رؤى',      count(*) from public.owner_insights where restaurant_id = r_b
      union all select 'وحدات',    count(*) from public.restaurant_features where restaurant_id = r_b
      union all select 'طاولات',   count(*) from public.tables where branch_id = br_b
      union all select 'استرجاع',  count(*) from public.winback_settings where restaurant_id = r_b
      union all select 'ملفّات',   count(*) from public.customer_restaurant where restaurant_id = r_b
      union all select 'أقسام',    count(*) from public.branch_zones where branch_id = br_b
      union all select 'رمز',      count(*) from public.restaurants where id = r_b and claim_code is not null
    ) s;

  ---------------------------------------------------------------
  -- (ب) الضيف — لا هويّة أصلًا
  ---------------------------------------------------------------
  set local role anon;

  perform pg_temp.expect_none('ضيف', 'عملاء «ب»',
    format('select count(*) from public.customers where id = %L', cu_b));
  perform pg_temp.expect_none('ضيف', 'طابور «ب»',
    format('select count(*) from public.waitlist_entries where branch_id = %L', br_b));
  perform pg_temp.expect_none('ضيف', 'سجلّ طابور «ب»',
    format('select count(*) from public.queue_events where branch_id = %L', br_b));
  perform pg_temp.expect_none('ضيف', 'حجوزات «ب»',
    format('select count(*) from public.reservations where branch_id = %L', br_b));
  perform pg_temp.expect_none('ضيف', 'طاقم «ب»',
    format('select count(*) from public.staff where restaurant_id = %L', r_b));
  perform pg_temp.expect_none('ضيف', 'ملفّات عملاء «ب»',
    format('select count(*) from public.customer_restaurant where restaurant_id = %L', r_b));
  perform pg_temp.expect_none('ضيف', 'هدايا «ب»',
    format('select count(*) from public.customer_rewards where restaurant_id = %L', r_b));
  perform pg_temp.expect_none('ضيف', 'شرائح «ب»',
    format('select count(*) from public.customer_segments where restaurant_id = %L', r_b));
  perform pg_temp.expect_none('ضيف', 'إحصاءات «ب»',
    format('select count(*) from public.daily_stats where branch_id = %L', br_b));
  perform pg_temp.expect_none('ضيف', 'تنبيهات «ب»',
    format('select count(*) from public.notifications where branch_id = %L', br_b));
  perform pg_temp.expect_none('ضيف', 'رؤى مالك «ب»',
    format('select count(*) from public.owner_insights where restaurant_id = %L', r_b));
  perform pg_temp.expect_none('ضيف', 'وحدات «ب»',
    format('select count(*) from public.restaurant_features where restaurant_id = %L', r_b));
  perform pg_temp.expect_none('ضيف', 'طاولات «ب»',
    format('select count(*) from public.tables where branch_id = %L', br_b));
  perform pg_temp.expect_none('ضيف', 'إعدادات استرجاع «ب»',
    format('select count(*) from public.winback_settings where restaurant_id = %L', r_b));

  -- الأعمدة السرّيّة في الدليل العام (أُغلقت في 0092)
  perform pg_temp.expect_none('ضيف', 'رمز تملّك «ب»',
    format('select count(*) from public.restaurants where id = %L and claim_code is not null', r_b));
  perform pg_temp.expect_none('ضيف', 'هاتف مالك «ب»',
    format('select count(*) from public.restaurants where id = %L and owner_phone is not null', r_b));

  -- الكتابة ممنوعة في كلّ حال
  perform pg_temp.expect_blocked('ضيف', 'كتابة على مطعم «ب»',
    format('update public.restaurants set name = ''مخترَق'' where id = %L', r_b));
  perform pg_temp.expect_blocked('ضيف', 'كتابة على طابور «ب»',
    format('update public.waitlist_entries set status = ''seated'' where id = %L', wl_b));
  perform pg_temp.expect_blocked('ضيف', 'إلغاء حجز «ب»',
    format('update public.reservations set status = ''cancelled'' where id = %L', rs_b));
  perform pg_temp.expect_blocked('ضيف', 'حذف فرع «ب»',
    format('delete from public.branches where id = %L', br_b));
  perform pg_temp.expect_blocked('ضيف', 'ترقية نفسه طاقمًا في «ب»',
    format('insert into public.staff(user_id, restaurant_id, role) values (%L, %L, ''owner'')', u_own_a, r_b));

  -- الدليل العام: يجب أن يُرى فعلًا وإلّا انكسر الموقع
  perform pg_temp.expect_some('ضيف', 'الدليل: مطعم «ب» ظاهر',
    format('select count(*) from public.restaurants where id = %L', r_b));
  perform pg_temp.expect_some('ضيف', 'الدليل: فرع «ب» ظاهر',
    format('select count(*) from public.branches where id = %L', br_b));

  reset role;

  ---------------------------------------------------------------
  -- (ج) مضيف «أ» — محصورٌ في فرعٍ واحدٍ من مطعمه
  ---------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', jwt_hst_a, true);

  perform pg_temp.expect_none('مضيف أ', 'عملاء «ب»',
    format('select count(*) from public.customers where id = %L', cu_b));
  perform pg_temp.expect_none('مضيف أ', 'طابور «ب»',
    format('select count(*) from public.waitlist_entries where branch_id = %L', br_b));
  perform pg_temp.expect_none('مضيف أ', 'سجلّ طابور «ب»',
    format('select count(*) from public.queue_events where branch_id = %L', br_b));
  perform pg_temp.expect_none('مضيف أ', 'حجوزات «ب»',
    format('select count(*) from public.reservations where branch_id = %L', br_b));
  perform pg_temp.expect_none('مضيف أ', 'طاقم «ب»',
    format('select count(*) from public.staff where restaurant_id = %L', r_b));
  perform pg_temp.expect_none('مضيف أ', 'هدايا «ب»',
    format('select count(*) from public.customer_rewards where restaurant_id = %L', r_b));
  perform pg_temp.expect_none('مضيف أ', 'شرائح «ب»',
    format('select count(*) from public.customer_segments where restaurant_id = %L', r_b));
  perform pg_temp.expect_none('مضيف أ', 'إحصاءات «ب»',
    format('select count(*) from public.daily_stats where branch_id = %L', br_b));
  perform pg_temp.expect_none('مضيف أ', 'تنبيهات «ب»',
    format('select count(*) from public.notifications where branch_id = %L', br_b));
  perform pg_temp.expect_none('مضيف أ', 'رؤى مالك «ب»',
    format('select count(*) from public.owner_insights where restaurant_id = %L', r_b));
  perform pg_temp.expect_none('مضيف أ', 'طاولات «ب»',
    format('select count(*) from public.tables where branch_id = %L', br_b));
  perform pg_temp.expect_none('مضيف أ', 'ملفّات عملاء «ب»',
    format('select count(*) from public.customer_restaurant where restaurant_id = %L', r_b));
  perform pg_temp.expect_none('مضيف أ', 'رمز تملّك «ب»',
    format('select count(*) from public.restaurants where id = %L and claim_code is not null', r_b));

  -- الحصر داخل «أ» نفسه: فرعٌ من مطعمه لا يخصّه
  perform pg_temp.expect_none('مضيف أ', 'طاولات فرع أ٢ (ليس فرعه)',
    format('select count(*) from public.tables where branch_id = %L', br_a2));

  perform pg_temp.expect_blocked('مضيف أ', 'كتابة على طابور «ب»',
    format('update public.waitlist_entries set status = ''seated'' where id = %L', wl_b));
  perform pg_temp.expect_blocked('مضيف أ', 'كتابة على حجز «ب»',
    format('update public.reservations set status = ''cancelled'' where id = %L', rs_b));
  perform pg_temp.expect_blocked('مضيف أ', 'كتابة على مطعم «ب»',
    format('update public.restaurants set name = ''مخترَق'' where id = %L', r_b));
  perform pg_temp.expect_blocked('مضيف أ', 'إضافة طاقم في «ب»',
    format('insert into public.staff(user_id, restaurant_id, role) values (%L, %L, ''owner'')', u_hst_a, r_b));
  perform pg_temp.expect_blocked('مضيف أ', 'إضافة صنف قائمة في «ب»',
    format('insert into public.menu_categories(restaurant_id, branch_id, name) values (%L, %L, ''حقن'')', r_b, br_b));
  perform pg_temp.expect_blocked('مضيف أ', 'ترقية نفسه في «أ»',
    format('update public.staff set role = ''owner'' where user_id = %L', u_hst_a));

  perform set_config('request.jwt.claims', '', true);
  reset role;

  ---------------------------------------------------------------
  -- (د) مالك «أ» — أوسع صلاحيّةٍ داخل علامته، وصفرٌ خارجها
  ---------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', jwt_own_a, true);

  perform pg_temp.expect_none('مالك أ', 'عملاء «ب»',
    format('select count(*) from public.customers where id = %L', cu_b));
  perform pg_temp.expect_none('مالك أ', 'طابور «ب»',
    format('select count(*) from public.waitlist_entries where branch_id = %L', br_b));
  perform pg_temp.expect_none('مالك أ', 'سجلّ طابور «ب»',
    format('select count(*) from public.queue_events where branch_id = %L', br_b));
  perform pg_temp.expect_none('مالك أ', 'حجوزات «ب»',
    format('select count(*) from public.reservations where branch_id = %L', br_b));
  perform pg_temp.expect_none('مالك أ', 'طاقم «ب»',
    format('select count(*) from public.staff where restaurant_id = %L', r_b));
  perform pg_temp.expect_none('مالك أ', 'هدايا «ب»',
    format('select count(*) from public.customer_rewards where restaurant_id = %L', r_b));
  perform pg_temp.expect_none('مالك أ', 'شرائح «ب»',
    format('select count(*) from public.customer_segments where restaurant_id = %L', r_b));
  perform pg_temp.expect_none('مالك أ', 'إحصاءات «ب»',
    format('select count(*) from public.daily_stats where branch_id = %L', br_b));
  perform pg_temp.expect_none('مالك أ', 'تنبيهات «ب»',
    format('select count(*) from public.notifications where branch_id = %L', br_b));
  perform pg_temp.expect_none('مالك أ', 'رؤى مالك «ب»',
    format('select count(*) from public.owner_insights where restaurant_id = %L', r_b));
  perform pg_temp.expect_none('مالك أ', 'وحدات «ب»',
    format('select count(*) from public.restaurant_features where restaurant_id = %L', r_b));
  perform pg_temp.expect_none('مالك أ', 'طاولات «ب»',
    format('select count(*) from public.tables where branch_id = %L', br_b));
  perform pg_temp.expect_none('مالك أ', 'ملفّات عملاء «ب»',
    format('select count(*) from public.customer_restaurant where restaurant_id = %L', r_b));
  perform pg_temp.expect_none('مالك أ', 'إعدادات استرجاع «ب»',
    format('select count(*) from public.winback_settings where restaurant_id = %L', r_b));
  perform pg_temp.expect_none('مالك أ', 'رمز تملّك «ب»',
    format('select count(*) from public.restaurants where id = %L and claim_code is not null', r_b));
  perform pg_temp.expect_none('مالك أ', 'هاتف مالك «ب»',
    format('select count(*) from public.restaurants where id = %L and owner_phone is not null', r_b));

  perform pg_temp.expect_blocked('مالك أ', 'كتابة على مطعم «ب»',
    format('update public.restaurants set name = ''مخترَق'' where id = %L', r_b));
  perform pg_temp.expect_blocked('مالك أ', 'كتابة على فرع «ب»',
    format('update public.branches set is_active = false where id = %L', br_b));
  perform pg_temp.expect_blocked('مالك أ', 'كتابة على طابور «ب»',
    format('update public.waitlist_entries set status = ''seated'' where id = %L', wl_b));
  perform pg_temp.expect_blocked('مالك أ', 'حذف حجوزات «ب»',
    format('delete from public.reservations where id = %L', rs_b));
  perform pg_temp.expect_blocked('مالك أ', 'حذف طاقم «ب»',
    format('delete from public.staff where restaurant_id = %L', r_b));
  perform pg_temp.expect_blocked('مالك أ', 'إعدادات فرع «ب»',
    format('update public.branch_settings set accepts_waitlist = false where branch_id = %L', br_b));
  perform pg_temp.expect_blocked('مالك أ', 'أقسام فرع «ب»',
    format('update public.branch_zones set name = ''مخترَق'' where branch_id = %L', br_b));
  perform pg_temp.expect_blocked('مالك أ', 'قائمة «ب»',
    format('update public.menu_items set price = 0 where restaurant_id = %L', r_b));
  perform pg_temp.expect_blocked('مالك أ', 'طاولات «ب»',
    format('update public.tables set seats = 99 where branch_id = %L', br_b));
  perform pg_temp.expect_blocked('مالك أ', 'تقييمات «ب»',
    format('update public.reviews set is_published = false where restaurant_id = %L', r_b));
  perform pg_temp.expect_blocked('مالك أ', 'صور «ب»',
    format('delete from public.restaurant_photos where restaurant_id = %L', r_b));
  perform pg_temp.expect_blocked('مالك أ', 'هدايا «ب»',
    format('delete from public.customer_rewards where restaurant_id = %L', r_b));
  perform pg_temp.expect_blocked('مالك أ', 'ضمّ نفسه إلى طاقم «ب»',
    format('insert into public.staff(user_id, restaurant_id, role) values (%L, %L, ''owner'')', u_own_a, r_b));
  perform pg_temp.expect_blocked('مالك أ', 'صيرورته مديرَ منصّة',
    format('insert into public.platform_admins(user_id) values (%L)', u_own_a));

  -- ويجب أن يرى بياناته هو — وإلّا فالعزل قاسٍ لا صحيح
  perform pg_temp.expect_some('مالك أ', 'يرى فرعَي مطعمه',
    format('select count(*) from public.branches where restaurant_id = %L', r_a));

  perform set_config('request.jwt.claims', '', true);
  reset role;

  ---------------------------------------------------------------
  -- (هـ) الاتّجاه المعاكس — مالك «ب» لا يرى «أ»
  ---------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', jwt_own_b, true);

  perform pg_temp.expect_none('مالك ب', 'عملاء «أ»',
    format('select count(*) from public.customers where id = %L', cu_a));
  perform pg_temp.expect_none('مالك ب', 'طاقم «أ»',
    format('select count(*) from public.staff where restaurant_id = %L', r_a));
  perform pg_temp.expect_none('مالك ب', 'طاولات فروع «أ»',
    format('select count(*) from public.tables where branch_id in (%L, %L)', br_a1, br_a2));
  perform pg_temp.expect_blocked('مالك ب', 'كتابة على فرع «أ»',
    format('update public.branches set is_active = false where restaurant_id = %L', r_a));

  perform set_config('request.jwt.claims', '', true);
  reset role;
end $iso$;

-- ── الحصيلة: الفاشل أوّلًا، ثم سطر الخلاصة ──
select who as الهويّة, chk as الفحص,
       case when pass then '✅' else '❌ تسريب' end as النتيجة,
       detail as التفصيل
  from iso_result
union all
select '——', 'الخلاصة',
       case when count(*) filter (where not pass) = 0 then '✅ عزلٌ تامّ' else '❌ فيه خرق' end,
       count(*) || ' فحصًا · ناجح ' || count(*) filter (where pass)
             || ' · فاشل ' || count(*) filter (where not pass)
  from iso_result
 order by 3 desc, 1, 2;

rollback;
