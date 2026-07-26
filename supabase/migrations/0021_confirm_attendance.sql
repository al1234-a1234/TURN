-- ============================================================================
--  «أكّد حضورك» — يضغط الاستقبال زر واتساب فتصل العميل رسالة بها رابط تذكرته،
--  فيؤكّد حضوره بضغطة، ويظهر للاستقبال ✓ فيعرف من سيحضر فعلًا.
--  الهدف: تقليل من يأخذ دورًا ولا يحضر (الطاولة تُحجز بلا فائدة).
--
--  الرابط يحمل معرّف الصف (UUID) وحده كمفتاح وصول — لأنه يُرسل إلى جوّال صاحبه
--  عبر واتساب. لذلك لا تُرجع الدالة أي بيانات شخصية (لا اسم ولا رقم)، فحتى لو
--  تسرّب الرابط لا ينكشف شيء عن العميل.
-- ============================================================================

alter table public.waitlist_entries
  add column if not exists confirmed_at timestamptz;

-- ---------------------------------------------------------------------------
-- عرض التذكرة من الرابط: الترتيب الحيّ داخل (الفرع + القسم + اليوم) بلا PII.
-- ---------------------------------------------------------------------------
create or replace function public.waitlist_ticket_by_id(p_entry_id uuid)
 returns table(
   status text, "position" integer, ahead integer, total integer,
   confirmed boolean, restaurant text, slug text
 )
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  with me as (
    select w.branch_id, w.zone, w.status::text as st, w."position" as pos,
           (w.confirmed_at is not null) as ok
    from public.waitlist_entries w
    where w.id = p_entry_id
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
  select me.st, (ahead_cte.n + 1), ahead_cte.n, total_cte.n, me.ok, r.name, r.slug
  from me
  cross join ahead_cte
  cross join total_cte
  join public.branches b on b.id = me.branch_id
  join public.restaurants r on r.id = b.restaurant_id;
$function$;

revoke all on function public.waitlist_ticket_by_id(uuid) from public;
grant execute on function public.waitlist_ticket_by_id(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- تأكيد الحضور — للصفوف الحيّة اليوم فقط. عملية غير ضارّة ولا تكشف شيئًا.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_attendance(p_entry_id uuid)
 returns boolean
 language plpgsql
 volatile
 security definer
 set search_path to ''
as $function$
declare
  v_hit int;
begin
  update public.waitlist_entries w
     set confirmed_at = now()
   where w.id = p_entry_id
     and w.status in ('waiting','notified')
     and (w.joined_at at time zone 'Asia/Riyadh')::date
       = (now() at time zone 'Asia/Riyadh')::date;
  get diagnostics v_hit = row_count;
  return v_hit > 0;
end;
$function$;

revoke all on function public.confirm_attendance(uuid) from public;
grant execute on function public.confirm_attendance(uuid) to anon, authenticated;
