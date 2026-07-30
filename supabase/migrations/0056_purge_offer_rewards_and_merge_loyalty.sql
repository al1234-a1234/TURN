-- 0056: تطهير بقايا العروض من بيانات الهدايا + دمج نقاط الولاء المكرّرة.
--
-- أ) هدايا قديمة وُلدت من نظام العروض المحذوف (وصفها «من عرض: …») كانت
--    لا تزال تظهر للعميل وفي صندوق الاستقبال. تُنسخ أولًا إلى مخطط
--    backup_offers (خاص — غير مكشوف عبر API) ليمكن استرجاعها فورًا لو
--    طلب المالك التراجع، ثم تُحذف من الجدول الحي.
-- ب) get_customer_loyalty كانت ترجع صفًا لكل سجل عميل يحمل الرقم نفسه
--    (ضيف + حساب) فيظهر المطعم مرتين بنقاط مبعثرة — الآن تُدمج بالجمع.

create schema if not exists backup_offers;
revoke all on schema backup_offers from public, anon, authenticated;

create table if not exists backup_offers.customer_rewards_from_offers
  as select * from public.customer_rewards where false;

insert into backup_offers.customer_rewards_from_offers
select * from public.customer_rewards where description like 'من عرض:%';

delete from public.customer_rewards where description like 'من عرض:%';

create or replace function public.get_customer_loyalty(p_phone text)
returns table(restaurant text, restaurant_slug text, points integer,
              reward_threshold integer, reward_description text,
              visits integer, tier text)
language plpgsql security definer set search_path to ''
as $$
begin
  if length(public.norm_phone_input(p_phone)) <> 9 then return; end if;
  if not public.check_rate('loyalty:p:' || public.norm_phone_input(p_phone), 60, interval '1 hour') then return; end if;
  return query
  select r.name, r.slug,
         sum(cr.points)::int,
         lp.reward_threshold, lp.reward_description,
         sum(cr.visits)::int,
         -- عند التكرار: طبقة السجل الأكثر زيارات هي الأصدق
         (array_agg(cr.tier order by cr.visits desc, cr.points desc))[1]
  from public.customer_restaurant cr
  join public.customers c on c.id = cr.customer_id
  join public.restaurants r on r.id = cr.restaurant_id
  join public.loyalty_programs lp on lp.restaurant_id = cr.restaurant_id and lp.is_active
  where right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 9) = public.norm_phone_input(p_phone)
    and (cr.points > 0 or cr.visits > 0)
  group by r.name, r.slug, lp.reward_threshold, lp.reward_description
  order by 3 desc;
end $$;
