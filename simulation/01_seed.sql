-- ════════════════════════════════════════════════════════════════════════════
--  بذر ١٠٠ مطعم بحياةٍ كاملة — لبيئة المحاكاة وحدها
--
--  ⛔ لا تُنفَّذ على الإنتاج. تتوقّف من نفسها إن وجدت مطعمًا غير مبذور.
--
--  كل صفٍّ مبذورٍ يحمل علامةً لا تُخطئها:
--    المطاعم  → slug يبدأ بـ 'sim-'
--    العملاء  → phone يبدأ بـ '0599'
--    والباقي يُشتقّ بالمفتاح الأجنبيّ من هذين، فالتنظيف أمرٌ واحد.
--
--  ساعات العمل ٦م–٢ف عمدًا: هذا النمط السعوديّ الواقعيّ، وهو الذي كشف عطب
--  تصفير الترتيب عند منتصف الليل (الترحيل 0108). نريد الحمل أن يمرّ به.
-- ════════════════════════════════════════════════════════════════════════════

-- ── حارس: لا يعمل إلا على قاعدةٍ فارغةٍ أو مبذورةٍ سلفًا ──
do $$
begin
  if exists (select 1 from public.restaurants where slug not like 'sim-%') then
    raise exception
      'توقّف: هذه القاعدة فيها مطاعم غير مبذورة — يبدو أنّها الإنتاج. لا تبذر هنا.'
      using errcode = 'P0001';
  end if;
end $$;

-- ── ٠) مالكٌ بدئيّ وحيد: restaurants.owner_id NOT NULL بلا افتراضي، وليس
--     لهذا الملف مستخدمٌ حقيقيّ بعد (02_make_sessions.mjs يُنشئ مالكًا فعليًّا
--     لكل مطعمٍ لاحقًا ويربطه عبر staff — والوصول الفعليّ يمرّ من هناك،
--     لا من هذا العمود). فهذا حسابٌ بدئيّ مؤقّت لا غير، يملأ القيد فقط.
do $$
declare
  v_owner uuid;
begin
  select id into v_owner from auth.users where email = 'seed-bootstrap-owner@sim.local';
  if v_owner is null then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_sso_user
    ) values (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(), 'authenticated', 'authenticated',
      'seed-bootstrap-owner@sim.local', '',
      now(), now(), now(), '{}'::jsonb, '{}'::jsonb, false
    );
  end if;
end $$;

-- ── ١) المطاعم: ١٠٠، وأحجامها متفاوتة ──
insert into public.restaurants (owner_id, name, name_en, slug, cuisine, cuisine_en, is_active, is_canary)
select (select id from auth.users where email = 'seed-bootstrap-owner@sim.local'),
       'مطعم المحاكاة ' || g, 'Sim Restaurant ' || g, 'sim-' || lpad(g::text,3,'0'),
       (array['إيطالي','سعودي','هندي','ياباني','مشويات'])[1 + (g % 5)],
       (array['Italian','Saudi','Indian','Japanese','Grill'])[1 + (g % 5)],
       true, false
from generate_series(1,100) g;

-- ── ٢) الفروع: فرعٌ لكلّ مطعم، وفرعٌ ثانٍ لكل ثالثٍ منها ──
insert into public.branches (restaurant_id, name, name_en, city, lat, lng, timezone, is_active)
select r.id, 'الفرع الرئيسي', 'Main', 'بريدة', 26.326, 43.975, 'Asia/Riyadh', true
from public.restaurants r where r.slug like 'sim-%';

insert into public.branches (restaurant_id, name, name_en, city, lat, lng, timezone, is_active)
select r.id, 'الفرع الثاني', 'Second', 'عنيزة', 26.084, 43.994, 'Asia/Riyadh', true
from public.restaurants r
where r.slug like 'sim-%' and (right(r.slug,3))::int % 3 = 0;

-- ── ٣) ساعات العمل ٦م–٢ف — تعبر منتصف الليل عمدًا ──
-- المُطلِق t_branch_default_zones ينشئ الأقسام تلقائيًّا، ولا نكرّرها هنا.
update public.branch_settings s
   set opening_hours = '{"open":"18:00","close":"02:00"}'::jsonb
  from public.branches b join public.restaurants r on r.id = b.restaurant_id
 where s.branch_id = b.id and r.slug like 'sim-%';

-- ── ٤) الطاولات: من ٥ إلى ٤٠ بحسب حجم المطعم ──
-- العمود label لا name (انحراف اسمٍ قديم — الجدول أُعيد تسميته منذ ترحيلٍ مبكّر)
insert into public.tables (branch_id, label, seats, is_active)
select b.id, 'ط' || n, 2 + (n % 6), true
from public.branches b
join public.restaurants r on r.id = b.restaurant_id
cross join lateral generate_series(1, 5 + ((right(r.slug,3))::int % 36)) n
where r.slug like 'sim-%';

-- ── ٥) القوائم: قسمان وستّة أصناف لكل فرع ──
insert into public.menu_categories (restaurant_id, branch_id, name, name_en, sort_order)
select b.restaurant_id, b.id, c.nm, c.en, c.so
from public.branches b
join public.restaurants r on r.id = b.restaurant_id
cross join (values ('المقبّلات','Starters',1), ('الأطباق الرئيسية','Mains',2)) as c(nm,en,so)
where r.slug like 'sim-%';

insert into public.menu_items (restaurant_id, branch_id, category_id, name, name_en, price, is_available)
select mc.restaurant_id, mc.branch_id, mc.id, 'صنف ' || n, 'Item ' || n, 15 + n * 5, true
from public.menu_categories mc
join public.restaurants r on r.id = mc.restaurant_id
cross join generate_series(1,3) n
where r.slug like 'sim-%';

-- ── ٦) العملاء: ٥٠٠٠ ضيف، هاتفهم يبدأ بـ0599 ──
insert into public.customers (user_id, full_name, phone)
select null, 'ضيف محاكاة ' || g, '0599' || lpad(g::text,6,'0')
from generate_series(1,5000) g;

-- ── الحصيلة ──
select 'مطاعم'  as الجدول, count(*)::text as العدد from public.restaurants where slug like 'sim-%'
union all select 'فروع',   (select count(*)::text from public.branches b join public.restaurants r on r.id=b.restaurant_id where r.slug like 'sim-%')
union all select 'طاولات', (select count(*)::text from public.tables t join public.branches b on b.id=t.branch_id join public.restaurants r on r.id=b.restaurant_id where r.slug like 'sim-%')
union all select 'أقسام منيو', (select count(*)::text from public.menu_categories where restaurant_id in (select id from public.restaurants where slug like 'sim-%'))
union all select 'أصناف',  (select count(*)::text from public.menu_items where restaurant_id in (select id from public.restaurants where slug like 'sim-%'))
union all select 'عملاء',  (select count(*)::text from public.customers where phone like '0599%');
