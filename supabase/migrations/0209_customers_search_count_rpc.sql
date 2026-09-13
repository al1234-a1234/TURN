-- نفس علّة 0208: عدّاد صفحات قائمة العملاء (لصفحة/دفعة الـ٥٠٠) كان أيضًا
-- HEAD count(exact) مباشرًا على customer_restaurant تحت RLS — فيتجمّد لأي
-- مطعمٍ بحجم Eficto تمامًا مثل الإجماليات في 0208. دالّةٌ واحدة تغطّي حالتي
-- الاستدعاء (بحثٌ أو بلا بحث) بنفس منطق التطابق في الواجهة تمامًا: اسمٌ
-- يحوي النصّ، أو رقمٌ يحوي الأرقام المطبَّعة (حين طولها ٣ فأكثر).

create or replace function public.customers_search_count(
  p_restaurant_id uuid,
  p_query text default null,
  p_digits text default null
)
returns bigint
language sql
stable security definer
set search_path to ''
as $function$
  select count(*)
  from public.customer_restaurant cr
  join public.customers c on c.id = cr.customer_id
  where cr.restaurant_id = p_restaurant_id
    and (public.staff_has_perm(p_restaurant_id, 'customers') or public.is_platform_admin())
    and (
      p_query is null
      or c.full_name ilike '%' || p_query || '%'
      or (p_digits is not null and c.phone like '%' || p_digits || '%')
    );
$function$;

revoke all on function public.customers_search_count(uuid, text, text) from public, anon;
grant execute on function public.customers_search_count(uuid, text, text) to authenticated;
