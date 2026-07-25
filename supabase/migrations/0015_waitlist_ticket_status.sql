-- ============================================================================
--  استعلام استطلاع خفيف لتذكرة العميل الضيف (polling).
--  يُرجع: حالة الصف + رقم الدور + عدد من أمامه (اليوم/نفس الفرع) — لا غير.
--  SECURITY DEFINER لأن الضيف لا يقرأ waitlist_entries عبر RLS. قراءة فقط،
--  لا يمسّ أي منطق قائم في الطابور.
-- ============================================================================
create or replace function public.waitlist_ticket_status(p_entry_id uuid, p_phone text)
 returns table(status text, "position" integer, ahead integer)
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select
    w.status::text,
    w."position",
    (select count(*)::int
       from public.waitlist_entries w2
      where w2.branch_id = w.branch_id
        and w2.status in ('waiting','notified')
        and w2."position" < w."position"
        and (w2.joined_at at time zone 'Asia/Riyadh')::date
          = (now() at time zone 'Asia/Riyadh')::date
    ) as ahead
  from public.waitlist_entries w
  join public.customers c on c.id = w.customer_id
  where w.id = p_entry_id
    and c.phone = trim(p_phone);
$function$;

revoke all on function public.waitlist_ticket_status(uuid, text) from public;
grant execute on function public.waitlist_ticket_status(uuid, text) to anon, authenticated;
