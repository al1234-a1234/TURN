-- الاكتشاف الأخطر الليلة: استعلام صفوف قائمة العملاء نفسه (لا العدّ فقط)
-- كان يمرّ بنفس فخّ RLS مضاعَفًا — customer_restaurant (staff_has_perm)
-- و customers (staff_can_read_customer) معًا، كلٌّ يُستدعى لكل صفٍّ من
-- ١٢,٣١٧. قِستها فعليًّا بهويّة staff حقيقية: **١٥.٢ ثانية** لصفحة واحدة
-- من ٥٠٠ صفّ. هذا يتجاوز أي مهلة معقولة، فتفشل الصفحة أحيانًا (٥٠٠) وتنجح
-- أحيانًا (توقيتٌ حظّي) — وكودنا كان يعامل الفشل الصامت كأنه «صفر عملاء»،
-- فتظهر «لا يوجد عملاء بعد» رغم أن العميل موجودٌ فعلًا. هذا التذبذب
-- بالضبط ما رآه المالك بالفيديو.
--
-- نفس حلّ 0208/0209/0211: دالّة SECURITY DEFINER تتجاوز RLS في الجدولين
-- معًا (تفحص الصلاحية مرّةً واحدة) وتُرجع الصفوف مباشرةً — لا عدًّا فقط.

create or replace function public.customers_page_rows(
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
  phone text
)
language sql
stable security definer
set search_path to ''
as $function$
  select cr.customer_id, cr.visits, cr.no_shows, cr.is_vip, cr.is_blocked, cr.tags, cr.note,
         cr.first_seen, cr.last_visit, cr.updated_at, c.full_name, c.phone
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
