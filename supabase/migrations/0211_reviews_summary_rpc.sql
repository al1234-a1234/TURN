-- نفس علّة 0208/0209 بجدولٍ آخر: عدّ التقييمات في القائمة الجانبية (كل صفحة)
-- ومتوسّط التقييم في النظرة العامة والتقارير كانت استعلامات مباشرة بلا حدٍّ
-- على reviews تحت RLS، وسياستا القراءة هناك (staff reads all reviews /
-- managers manage reviews) تستدعيان is_staff_of(restaurant_id) و
-- is_brand_manager(restaurant_id) و staff_has_perm(restaurant_id, ...) بعمود
-- الصفّ لا بثابت — فتتكرّر لكل صفّ تمامًا مثل عطل customer_restaurant.
--
-- لا مطعمٍ اليوم يملك ما يكفي من التقييمات ليصطدم بها فعليًّا (أكثرها ٤ على
-- Pizza peel)، لكنها نفس القنبلة الموقوتة لمطعمٍ ضخمٍ قادم. دالّةٌ واحدة
-- تغطّي الحالتين (عدٌّ فقط، أو عدٌّ ومتوسّط) بمسحةٍ واحدة تتجاوز RLS.

create or replace function public.reviews_summary(p_restaurant_id uuid)
returns table (total bigint, avg_rating numeric)
language sql
stable security definer
set search_path to ''
as $function$
  select count(*), round(avg(rating), 1)
  from public.reviews
  where restaurant_id = p_restaurant_id
    and (
      public.is_platform_admin()
      or public.is_brand_manager(p_restaurant_id)
      or public.staff_has_perm(p_restaurant_id, 'reviews')
    );
$function$;

revoke all on function public.reviews_summary(uuid) from public, anon;
grant execute on function public.reviews_summary(uuid) to authenticated;
