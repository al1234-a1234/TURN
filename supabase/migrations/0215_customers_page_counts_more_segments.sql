-- شرائح «لهم هدايا / متغيّبون / محظورون» كانت تُحسب من صفحة الـ٥٠٠ المعروضة
-- فقط (مثل «الكل»/VIP قبل 0208) — فمطعمٌ يفوق عملاؤه ٥٠٠ يرى عددًا لا
-- يعكس الحقيقة. «منقطعون» له عدٌّ صحيحٌ فعلًا (dormant_count) لكنه لم يكن
-- يُستعمَل لهذه الشريحة. نوسّع customers_page_counts بثلاثة أعمدة، ونربط
-- الأربعة كلها بمصدرٍ واحدٍ شامل للمطعم — لا قائمة صفحةٍ واحدة.

drop function if exists public.customers_page_counts(uuid, timestamptz);

create function public.customers_page_counts(
  p_restaurant_id uuid,
  p_dormant_since timestamptz
)
returns table(
  all_count bigint,
  vip_count bigint,
  returning_count bigint,
  new_count bigint,
  dormant_count bigint,
  noshow_count bigint,
  blocked_count bigint,
  gifts_count bigint
)
language sql
stable security definer
set search_path to ''
as $function$
  select
    count(*),
    count(*) filter (where not is_blocked and is_vip),
    count(*) filter (where not is_blocked and visits >= 2),
    count(*) filter (where not is_blocked and visits <= 1),
    count(*) filter (where not is_blocked and last_visit < p_dormant_since),
    count(*) filter (where not is_blocked and no_shows >= 2),
    count(*) filter (where is_blocked),
    count(*) filter (where exists (
      select 1 from public.customer_rewards r
      where r.restaurant_id = customer_restaurant.restaurant_id
        and r.customer_id = customer_restaurant.customer_id
        and r.status = 'active'))
  from public.customer_restaurant
  where restaurant_id = p_restaurant_id
    and (public.staff_has_perm(p_restaurant_id, 'customers') or public.is_platform_admin());
$function$;

revoke all on function public.customers_page_counts(uuid, timestamptz) from public, anon;
grant execute on function public.customers_page_counts(uuid, timestamptz) to authenticated;
