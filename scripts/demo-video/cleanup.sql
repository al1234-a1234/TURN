-- ============================================================================
--  حذف «مطعم الأصالة» وكلّ أثره.
--
--  محصورٌ بمعرّفات المستأجر التجريبيّ وحدها — لا شرطَ فيه يمكن أن يطال
--  مطعمًا حقيقيًّا. والترتيب من الورقة إلى الجذر احترامًا للمفاتيح الأجنبيّة.
--
--    psql "$DB_URL" -f scripts/demo-video/cleanup.sql
--
--  ملاحظة: العملاء الذين أضافهم الالتقاط (محمد أحمد · سارة ناصر) يُحذفون
--  بمطابقة أرقامهم الوهميّة، لأنّ معرّفاتهم تولّدها القاعدة لا هذا الملفّ.
-- ============================================================================

begin;

-- أحداث الطابور أوّلًا: queue_events.customer_id قيدُه RESTRICT، والحذف
-- الساذج للعميل يسقط بـ23503 (نفس الدرس المكتوب في ٠١٩٤).
delete from public.queue_events
 where entry_id in (select id from public.waitlist_entries
                     where branch_id = 'dec0de00-0000-4000-8000-000000000002');

delete from public.waitlist_entries
 where branch_id = 'dec0de00-0000-4000-8000-000000000002';

delete from public.menu_items
 where restaurant_id = 'dec0de00-0000-4000-8000-000000000001';
delete from public.menu_categories
 where restaurant_id = 'dec0de00-0000-4000-8000-000000000001';

delete from public.branch_zones
 where branch_id = 'dec0de00-0000-4000-8000-000000000002';
delete from public.branch_settings
 where branch_id = 'dec0de00-0000-4000-8000-000000000002';
delete from public.branches
 where id = 'dec0de00-0000-4000-8000-000000000002';
delete from public.restaurants
 where id = 'dec0de00-0000-4000-8000-000000000001';

-- عملاء الاختبار: المزروعون بمعرّفاتٍ ثابتة، ومن أضافهم الالتقاط بأرقامهم.
delete from public.customers
 where id in ('dec0de00-0000-4000-8000-000000000101','dec0de00-0000-4000-8000-000000000102',
              'dec0de00-0000-4000-8000-000000000103','dec0de00-0000-4000-8000-000000000104',
              'dec0de00-0000-4000-8000-000000000105')
    or phone in ('0551002030','0554887711')
    or phone like '05511002%';

commit;

-- تحقّقٌ صريح: يجب أن تكون الأربعة أصفارًا.
select
  (select count(*) from public.restaurants where id = 'dec0de00-0000-4000-8000-000000000001') as restaurants_left,
  (select count(*) from public.branches    where id = 'dec0de00-0000-4000-8000-000000000002') as branches_left,
  (select count(*) from public.waitlist_entries
     where branch_id = 'dec0de00-0000-4000-8000-000000000002')                                as queue_left,
  (select count(*) from public.customers where phone like '05511002%'
      or phone in ('0551002030','0554887711'))                                                as demo_customers_left;
