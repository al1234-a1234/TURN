-- ════════════════════════════════════════════════════════════════════════════
--  تنظيف المحاكاة — أمرٌ واحد يمحو كل ما بُذر، مع العدّ قبل وبعد
--
--  ⛔ لا يُنفَّذ على الإنتاج. يتوقّف من نفسه إن وجد مطعمًا غير مبذور.
--
--  كل شيء يُشتقّ من علامتين: slug يبدأ بـ'sim-' وphone يبدأ بـ'0599'.
--  والترتيب يفرضه القيد المرجعيّ: الحجوزات والطابور تشيران إلى customers
--  بـRESTRICT فتُحذف قبلها، وحذف المطعم يتتالى على فروعه وطاولاته وقوائمه.
-- ════════════════════════════════════════════════════════════════════════════

do $$
begin
  if exists (select 1 from public.restaurants where slug not like 'sim-%') then
    raise exception 'توقّف: القاعدة فيها مطاعم غير مبذورة — يبدو أنّها الإنتاج.'
      using errcode = 'P0001';
  end if;
end $$;

create temp table _قبل as
select (select count(*) from public.restaurants)       as مطاعم,
       (select count(*) from public.branches)          as فروع,
       (select count(*) from public.waitlist_entries)  as طابور,
       (select count(*) from public.reservations)      as حجوزات,
       (select count(*) from public.customers)         as عملاء,
       (select count(*) from public.staff)             as موظّفون,
       (select count(*) from public.owner_insights)    as رؤى;

-- الأبناء أوّلًا (RESTRICT على customers)
delete from public.waitlist_entries
 where customer_id in (select id from public.customers where phone like '0599%');
delete from public.reservations
 where customer_id in (select id from public.customers where phone like '0599%');
delete from public.reviews
 where customer_id in (select id from public.customers where phone like '0599%');
delete from public.customer_restaurant
 where customer_id in (select id from public.customers where phone like '0599%');
delete from public.customers where phone like '0599%';

-- ثمّ المطاعم — يتتالى على الفروع والطاولات والقوائم والإعدادات والموظّفين
delete from public.owner_insights
 where restaurant_id in (select id from public.restaurants where slug like 'sim-%');
delete from public.restaurants where slug like 'sim-%';

select 'مطاعم'  as الجدول, q.مطاعم::text || ' → ' || (select count(*) from public.restaurants)::text       as قبل_وبعد from _قبل q
union all select 'فروع',   q.فروع::text  || ' → ' || (select count(*) from public.branches)::text          from _قبل q
union all select 'طابور',  q.طابور::text || ' → ' || (select count(*) from public.waitlist_entries)::text  from _قبل q
union all select 'حجوزات', q.حجوزات::text|| ' → ' || (select count(*) from public.reservations)::text      from _قبل q
union all select 'عملاء',  q.عملاء::text || ' → ' || (select count(*) from public.customers)::text         from _قبل q
union all select 'موظّفون', q.موظّفون::text|| ' → ' || (select count(*) from public.staff)::text            from _قبل q
union all select 'رؤى',    q.رؤى::text   || ' → ' || (select count(*) from public.owner_insights)::text    from _قبل q;

-- ملاحظة: حسابات auth.users لا تُحذف من هنا (خارج نطاق SQL العادي).
-- امحُها من لوحة Supabase ← Authentication ← تصفية بـ@sim.local ← حذف جماعيّ.
-- أو أعِد إنشاء المشروع من الصفر، وهو الأسرع.
