-- 0055: إزالة نظام العروض كليًا — بطلب صريح من المالك.
-- تبقى منظومة الهدايا كاملة: customer_rewards، الأختام، هدية الترحيب،
-- المكافأة الفورية، الحملات (grant_reward_to_segment). ما يُحذف هو
-- «العروض» فقط: الجداول، دالة المطالبة، روبوت عروض الركود، وموديولاته.

-- روبوت عروض الركود كان يفعّل/يطفئ عروضًا — بلا عروض لا معنى له
do $$ begin
  perform cron.unschedule('slow-hours');
exception when others then null; end $$;
drop function if exists public.run_slow_hours();

drop function if exists public.claim_offer(uuid, text, text);
drop table if exists public.offer_redemptions;
drop table if exists public.offers;
drop type if exists public.offer_kind;

-- الموديولان من الكتالوج + أي تفعيلات لهما
delete from public.restaurant_features where module_key in ('offers', 'slow_hours');
delete from public.feature_modules where key in ('offers', 'slow_hours');

-- تنظيف صلاحية «offers» من خرائط صلاحيات الموظفين
update public.staff set permissions = permissions - 'offers'
where permissions ? 'offers';

-- تنبيهات «عروض الركود» القديمة في صندوق المالك
delete from public.owner_insights where kind = 'slow_hours';
