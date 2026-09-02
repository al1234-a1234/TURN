-- ============================================================================
--  «مطعم الأصالة» — مستأجرٌ تجريبيّ للمقاطع التسويقيّة.
--
--  كلّ اسمٍ ورقمٍ هنا مخترَع. صفر مساسٍ بإفيكتو أو Pizza peel أو أيّ مطعمٍ
--  حقيقيّ: لا يقرأ هذا الملفّ صفًّا منها ولا يكتب فيها.
--
--  ── قبل التشغيل ──
--  استبدل :owner_uid بمعرّف حساب الشركاء الاختباريّ الذي ستسجّل به الدخول
--  (‏auth.users.id). الملكيّة هي ما يفتح لك /dashboard على هذا المطعم.
--
--    psql "$DB_URL" -v owner_uid="'00000000-0000-0000-0000-000000000000'" \
--         -f scripts/demo-video/seed.sql
--
--  ── العزل: is_active = true مع is_canary = true ──
--  هذه التركيبة وحدها تحقّق الشرطين معًا، وقد ثبتت بالتجربة لا بالتقدير:
--
--  ١) `is_active = false` **يقتل الرحلة كلّها**. محفّز `enforce_platform_open()`
--     يرفض أيّ إدراجٍ في الطابور بـP0002 «المطعم متوقّف حاليًا» ما لم يكن
--     `restaurants.is_active = true`. جرّبته على المحاكاة فسقط الإدراج.
--
--  ٢) والإخفاء يأتي من `is_canary` لا من `is_active`:
--       public-cache.ts:54-55  →  .eq("is_active", true).eq("is_canary", false)
--       search/page.tsx:18     →  .eq("is_canary", false)
--     فمستأجرٌ كناريّ لا يظهر في الاكتشاف ولا في البحث لأيّ عميلٍ حقيقيّ،
--     بينما تعمل صفحته ولوحاته بالرابط المباشر — وهو بالضبط ما نحتاج.
--
--  والاستثناء المعروف: تقارير المنصّة العامّة تستبعد الكناري. أمّا لوحة
--  المالك لهذا المطعم فتعرض بياناته هو، فلقطات التقارير سليمة.
-- ============================================================================

begin;

-- ── المطعم ──
insert into public.restaurants
  (id, owner_id, name, name_en, slug, is_active, is_canary,
   cuisine, cuisine_en, description, manual_rating)
values
  ('dec0de00-0000-4000-8000-000000000001', :owner_uid,
   'مطعم الأصالة', 'Al Asalah', 'alasalah', true, true,
   'مأكولات سعوديّة', 'Saudi', 'أصالة المذاق السعوديّ في قلب المدينة', 4.6)
on conflict (id) do update
  set name = excluded.name, slug = excluded.slug,
      is_active = true, is_canary = true;

-- ── الفرع ──
insert into public.branches (id, restaurant_id, name, name_en, city, is_active, timezone)
values ('dec0de00-0000-4000-8000-000000000002',
        'dec0de00-0000-4000-8000-000000000001',
        'الفرع الرئيسي', 'Main Branch', 'الرياض', true, 'Asia/Riyadh')
on conflict (id) do update set is_active = true;

-- ── الإعدادات: الطابور مفتوح، وإلّا رُفض كلّ انضمامٍ بـP0011 ──
insert into public.branch_settings
  (branch_id, accepts_waitlist, queue_paused, join_frozen, manually_closed,
   max_party_size, max_waitlist_size, has_inside, has_outside,
   opening_hours)
values ('dec0de00-0000-4000-8000-000000000002',
        true, false, false, false, 12, 60, true, true,
        '{"open":"00:00","close":"23:59"}'::jsonb)
on conflict (branch_id) do update
  set accepts_waitlist = true, queue_paused = false, join_frozen = false,
      manually_closed = false,
      opening_hours = '{"open":"00:00","close":"23:59"}'::jsonb;

-- ساعاتٌ على مدار اليوم عمدًا: الالتقاط قد يقع في أيّ ساعة، وفرعٌ «مغلق
-- الآن» يمنع الانضمام فتسقط نصف لقطات المقطع الأوّل.

-- ── الأقسام ──
insert into public.branch_zones (branch_id, key, name, name_en, sort_order, is_active)
values ('dec0de00-0000-4000-8000-000000000002', 'inside',  'داخلي', 'Inside',  1, true),
       ('dec0de00-0000-4000-8000-000000000002', 'outside', 'خارجي', 'Outside', 2, true)
on conflict do nothing;

-- ── المنيو: قسمان وثمانية أصناف ──
insert into public.menu_categories (id, restaurant_id, branch_id, name, name_en, sort_order)
values ('dec0de00-0000-4000-8000-000000000010',
        'dec0de00-0000-4000-8000-000000000001',
        'dec0de00-0000-4000-8000-000000000002', 'الأطباق الرئيسيّة', 'Mains', 1),
       ('dec0de00-0000-4000-8000-000000000011',
        'dec0de00-0000-4000-8000-000000000001',
        'dec0de00-0000-4000-8000-000000000002', 'المقبّلات والحلى', 'Sides & Sweets', 2)
on conflict (id) do nothing;

insert into public.menu_items
  (restaurant_id, branch_id, category_id, name, name_en, description, price, is_available, sort_order)
values
 ('dec0de00-0000-4000-8000-000000000001','dec0de00-0000-4000-8000-000000000002','dec0de00-0000-4000-8000-000000000010','كبسة لحم','Lamb Kabsa','أرزّ بسمتي مع لحم ضأنٍ مطبوخٍ على الفحم', 68, true, 1),
 ('dec0de00-0000-4000-8000-000000000001','dec0de00-0000-4000-8000-000000000002','dec0de00-0000-4000-8000-000000000010','مندي دجاج','Chicken Mandi','دجاجٌ في التنّور مع أرزٍّ مبهّر', 45, true, 2),
 ('dec0de00-0000-4000-8000-000000000001','dec0de00-0000-4000-8000-000000000002','dec0de00-0000-4000-8000-000000000010','جريش','Jareesh','جريشٌ بالسمن البلديّ والبصل المحمّر', 32, true, 3),
 ('dec0de00-0000-4000-8000-000000000001','dec0de00-0000-4000-8000-000000000002','dec0de00-0000-4000-8000-000000000010','مظبي دجاج','Mathbi Chicken','دجاجٌ مشويّ على الحجر', 52, true, 4),
 ('dec0de00-0000-4000-8000-000000000001','dec0de00-0000-4000-8000-000000000002','dec0de00-0000-4000-8000-000000000011','سمبوسة خضار','Veg Samosa','ستّ حبّاتٍ مقرمشة', 14, true, 1),
 ('dec0de00-0000-4000-8000-000000000001','dec0de00-0000-4000-8000-000000000002','dec0de00-0000-4000-8000-000000000011','سلطة فتّوش','Fattoush','خضارٌ طازج مع خبزٍ محمّص', 18, true, 2),
 ('dec0de00-0000-4000-8000-000000000001','dec0de00-0000-4000-8000-000000000002','dec0de00-0000-4000-8000-000000000011','لقيمات','Luqaimat','بعجينِ التمر والقشطة', 22, true, 3),
 ('dec0de00-0000-4000-8000-000000000001','dec0de00-0000-4000-8000-000000000002','dec0de00-0000-4000-8000-000000000011','قهوة عربيّة','Arabic Coffee','مع تمرٍ سكّري', 12, true, 4)
on conflict do nothing;

-- ── عملاء وهميّون + طابورٌ فيه خمسة ──
-- الأرقام كلّها مخترَعة في نطاق 0551xxxxxx، ولا تطابق أيّ عميلٍ حقيقيّ.
insert into public.customers (id, full_name, phone)
values ('dec0de00-0000-4000-8000-000000000101','خالد العتيبي','0551100201'),
       ('dec0de00-0000-4000-8000-000000000102','سارة ناصر','0551100202'),
       ('dec0de00-0000-4000-8000-000000000103','عبدالله محمد','0551100203'),
       ('dec0de00-0000-4000-8000-000000000104','نورة الشمري','0551100204'),
       ('dec0de00-0000-4000-8000-000000000105','فهد الدوسري','0551100205')
on conflict (id) do nothing;

-- الطابور: حذفٌ ثمّ إدراج، لا ON CONFLICT.
-- السبب مقيس: `waitlist_entries` عليه قيد EXCLUDE **مؤجَّل** للترقيم لكلّ
-- (فرع، قسم)، وPostgres يرفض القيود المؤجَّلة حَكَمًا لـON CONFLICT:
--   55000: ON CONFLICT does not support deferrable ... constraints as arbiters
-- والحذف محصورٌ بفرع العرض وحده، فيبقى السكربت قابلًا لإعادة التشغيل.
delete from public.queue_events
 where entry_id in (select id from public.waitlist_entries
                     where branch_id = 'dec0de00-0000-4000-8000-000000000002');
delete from public.waitlist_entries
 where branch_id = 'dec0de00-0000-4000-8000-000000000002';

insert into public.waitlist_entries
  (branch_id, customer_id, party_size, status, position, zone, joined_at)
values
 ('dec0de00-0000-4000-8000-000000000002','dec0de00-0000-4000-8000-000000000101',2,'waiting',1,'inside', now() - interval '22 minutes'),
 ('dec0de00-0000-4000-8000-000000000002','dec0de00-0000-4000-8000-000000000102',4,'waiting',2,'inside', now() - interval '17 minutes'),
 ('dec0de00-0000-4000-8000-000000000002','dec0de00-0000-4000-8000-000000000103',3,'waiting',3,'inside', now() - interval '11 minutes'),
 ('dec0de00-0000-4000-8000-000000000002','dec0de00-0000-4000-8000-000000000104',2,'waiting',4,'inside', now() - interval '6 minutes'),
 ('dec0de00-0000-4000-8000-000000000002','dec0de00-0000-4000-8000-000000000105',5,'waiting',5,'inside', now() - interval '2 minutes');

commit;

select 'مطعم الأصالة جاهز' as status,
       'dec0de00-0000-4000-8000-000000000002' as demo_branch_id,
       'alasalah' as demo_slug,
       (select count(*) from public.waitlist_entries
         where branch_id='dec0de00-0000-4000-8000-000000000002' and status='waiting') as in_queue;
