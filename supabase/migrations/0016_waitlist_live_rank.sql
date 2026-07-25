-- ============================================================================
--  ترقيم الطابور الحيّ (live rank) — رقم الدور المعروض = عدد من أمامك + 1.
--  المشكلة: كان `position` رقمًا ثابتًا يُخزَّن وقت الانضمام ولا يُعاد حسابه،
--  فتظهر فجوات (٤ ٥ ٦ لثلاثة أشخاص) ولا ينضغط الرقم عند إجلاس/إزالة من أمامك.
--  الحل: تُرجِع الدالة الترتيب الحيّ داخل نفس (الفرع + القسم + اليوم):
--    position = ahead + 1 ،  ahead = عدد من أمامه ،  total = إجمالي القسم الآن.
--  قراءة فقط، SECURITY DEFINER (الضيف لا يقرأ waitlist_entries عبر RLS).
-- ============================================================================
-- تغيّر نوع الإرجاع (أُضيف total) ⇒ لا بد من DROP قبل إعادة الإنشاء.
drop function if exists public.waitlist_ticket_status(uuid, text);

create or replace function public.waitlist_ticket_status(p_entry_id uuid, p_phone text)
 returns table(status text, "position" integer, ahead integer, total integer)
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  with me as (
    select w.branch_id, w.zone, w.status::text as status, w."position" as pos
    from public.waitlist_entries w
    join public.customers c on c.id = w.customer_id
    where w.id = p_entry_id
      and c.phone = trim(p_phone)
  ),
  ahead_cte as (
    select count(*)::int as n
    from public.waitlist_entries w2, me
    where w2.branch_id = me.branch_id
      and w2.zone is not distinct from me.zone
      and w2.status in ('waiting','notified')
      and w2."position" < me.pos
      and (w2.joined_at at time zone 'Asia/Riyadh')::date
        = (now() at time zone 'Asia/Riyadh')::date
  ),
  total_cte as (
    select count(*)::int as n
    from public.waitlist_entries w3, me
    where w3.branch_id = me.branch_id
      and w3.zone is not distinct from me.zone
      and w3.status in ('waiting','notified')
      and (w3.joined_at at time zone 'Asia/Riyadh')::date
        = (now() at time zone 'Asia/Riyadh')::date
  )
  select
    me.status,
    (ahead_cte.n + 1) as "position",
    ahead_cte.n       as ahead,
    total_cte.n       as total
  from me, ahead_cte, total_cte;
$function$;

revoke all on function public.waitlist_ticket_status(uuid, text) from public;
grant execute on function public.waitlist_ticket_status(uuid, text) to anon, authenticated;
