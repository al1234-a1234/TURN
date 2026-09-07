-- إضافة waitlist_entries.notes (موجودٌ بالقاعدة من قبل بلا أي استخدام)
-- إلى staff_branch_queue تحت اسم visit_note — لتمييزه عن customer_restaurant.note
-- الدائم (يظهر عبر كل زيارات العميل، مقيّدٌ بصلاحية «العملاء»). هذا خاصٌّ
-- بهذا الدور تحديدًا («اتصلنا عليه، يبي نص ساعة») ويظهر لكل الاستقبال.
--
-- تغيير RETURNS TABLE يمنع CREATE OR REPLACE (Postgres يرفض تغيير نوع
-- الإرجاع) — DROP أولًا، بنفس التوقيع تمامًا فلا مجال لتكرار درس اليوم
-- (overload يتيم من توقيعٍ مختلف).

drop function if exists public.staff_branch_queue(uuid);

create function public.staff_branch_queue(p_branch_id uuid)
returns table(
  id uuid,
  customer_id uuid,
  "position" integer,
  party_size integer,
  zone text,
  status waitlist_status,
  joined_at timestamptz,
  confirmed_at timestamptz,
  distance_m integer,
  full_name text,
  phone text,
  is_vip boolean,
  is_blocked boolean,
  no_shows integer,
  note text,
  visit_note text
)
language plpgsql
stable security definer
set search_path to ''
as $function$
begin
  if not (public.is_platform_admin()
          or p_branch_id = any (coalesce(public.my_branch_ids(), array[]::uuid[]))) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
    select w.id, w.customer_id, w."position", w.party_size, w.zone, w.status,
           w.joined_at, w.confirmed_at, w.distance_m, c.full_name, c.phone,
           coalesce(cr.is_vip, false), coalesce(cr.is_blocked, false),
           coalesce(cr.no_shows, 0), cr.note, w.notes
      from public.waitlist_entries w
      join public.customers c on c.id = w.customer_id
      join public.branches b on b.id = w.branch_id
      left join public.customer_restaurant cr
        on cr.customer_id = w.customer_id and cr.restaurant_id = b.restaurant_id
     where w.branch_id = p_branch_id
       and w.status in ('waiting', 'notified')
     order by w."position" asc nulls last;
end
$function$;

revoke all on function public.staff_branch_queue(uuid) from anon;
revoke all on function public.staff_branch_queue(uuid) from public;
grant execute on function public.staff_branch_queue(uuid) to authenticated;
