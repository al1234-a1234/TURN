-- طلب المالك بعد رؤية الميزة حيًّا: مو لازم يرجع لسجلّ اليوم عشان يشوف
-- «بدّلته مع مين» — يبيها على نفس بطاقة الدور في الشاشة الحيّة. نضيف
-- last_swap_name: اسم آخر من بُدِّل معه هذا الدور.
--
-- بلا نافذة زمنيّة عمدًا — أوّل مسوّدة قيّدتها بـ١٥ دقيقة فرفضها المالك
-- صراحةً: «يبيها ثابتة لين يجلس». وهذا صحيحٌ أصلًا بلا أي شرط: الدالّة
-- الآن كالأمس لا تُرجع إلّا صفوفًا status in ('waiting','notified')، فبمجرّد
-- أن يُجلَس الضيف يختفي من الطابور الحيّ ويختفي معه العرض — لا حاجة لقصّ
-- الوقت من هنا، القصّ الطبيعي أصلًا هو الجلوس.
--
-- نفس درس اليوم: تغيير RETURNS TABLE يمنع CREATE OR REPLACE — DROP أولًا،
-- بنفس التوقيع تمامًا (0202).

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
  visit_note text,
  last_swap_name text
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
           coalesce(cr.no_shows, 0), cr.note, w.notes,
           (select e.detail->>'with_name'
              from public.queue_events e
             where e.entry_id = w.id and e.kind = 'swapped'
             order by e.at desc limit 1)
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
