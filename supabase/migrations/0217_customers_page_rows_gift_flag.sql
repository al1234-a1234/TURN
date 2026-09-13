-- شارة «هديّة فعّالة» في قائمة العملاء كانت تُبنى من استعلامٍ مباشر منفصل
-- على customer_rewards (كل الهدايا النشطة للمطعم، بلا حدّ) تحت نفس نمط
-- RLS غير الملفوف الذي أصلحناه الليلة في كل مكانٍ آخر — نشطٌ اليوم بلا
-- أثر (رقمٌ صغير) لكنه ينفجر أول ما تُرسَل حملة لشريحة كاملة. الحلّ هنا
-- أبسط من دالّة جديدة: نضيف العمود لنفس customers_page_rows، فيُحسب
-- على الصفحة المحدودة (٥٠٠ صفّ) لا على المطعم كله — نفس مبدأ الحدّ.

drop function if exists public.customers_page_rows(uuid, text, text, integer, integer);

create function public.customers_page_rows(
  p_restaurant_id uuid,
  p_query text default null,
  p_digits text default null,
  p_limit integer default 500,
  p_offset integer default 0
)
returns table (
  customer_id uuid,
  visits integer,
  no_shows integer,
  is_vip boolean,
  is_blocked boolean,
  tags text[],
  note text,
  first_seen timestamptz,
  last_visit timestamptz,
  updated_at timestamptz,
  full_name text,
  phone text,
  has_active_gift boolean
)
language sql
stable security definer
set search_path to ''
as $function$
  select cr.customer_id, cr.visits, cr.no_shows, cr.is_vip, cr.is_blocked, cr.tags, cr.note,
         cr.first_seen, cr.last_visit, cr.updated_at, c.full_name, c.phone,
         exists (
           select 1 from public.customer_rewards r
           where r.restaurant_id = cr.restaurant_id
             and r.customer_id = cr.customer_id
             and r.status = 'active'
         ) as has_active_gift
  from public.customer_restaurant cr
  join public.customers c on c.id = cr.customer_id
  where cr.restaurant_id = p_restaurant_id
    and (public.staff_has_perm(p_restaurant_id, 'customers') or public.is_platform_admin())
    and (
      p_query is null
      or c.full_name ilike '%' || p_query || '%'
      or (p_digits is not null and c.phone like '%' || p_digits || '%')
    )
  order by cr.is_vip desc, cr.visits desc, cr.customer_id asc
  limit least(coalesce(p_limit, 500), 500) offset greatest(coalesce(p_offset, 0), 0);
$function$;

revoke all on function public.customers_page_rows(uuid, text, text, integer, integer) from public, anon;
grant execute on function public.customers_page_rows(uuid, text, text, integer, integer) to authenticated;
