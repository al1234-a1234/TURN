-- ============================================================================
--  إلغاء الدور من رابط التذكرة — خيار «ألغِ دوري» بجانب «أكّد حضوري»،
--  فيردّ العميل بضغطة بدل أن يكتب في واتساب.
--
--  التفويض: معرّف التذكرة (UUID) هو المفتاح — كما في confirm_attendance —
--  لأنه لا يصل إلا إلى جوّال صاحبه عبر واتساب. ومع ذلك نضيّق قدر الإمكان:
--  لا يُلغى إلا صفٌّ حيٌّ من اليوم.
-- ============================================================================
create or replace function public.cancel_by_ticket(p_entry_id uuid)
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
     set status = 'cancelled'
   where w.id = p_entry_id
     and w.status in ('waiting','notified')
     and (w.joined_at at time zone 'Asia/Riyadh')::date
       = (now() at time zone 'Asia/Riyadh')::date;
  get diagnostics v_hit = row_count;
  return v_hit > 0;
end;
$function$;

revoke all on function public.cancel_by_ticket(uuid) from public;
grant execute on function public.cancel_by_ticket(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- من تقدّم دوره بعد إلغاءٍ من رابط التذكرة (بلا رقم جوّال — المعرّف هو المفتاح).
-- نفس حارس نظيرتها: لا بد أن يكون الصف ملغى فعلًا وخلال دقيقتين.
-- ---------------------------------------------------------------------------
create or replace function public.queue_push_targets_after_ticket_cancel(p_entry_id uuid)
 returns table(endpoint text, p256dh text, auth text, rank integer, venue text, slug text)
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  with me as (
    select w.branch_id, w.zone
    from public.waitlist_entries w
    where w.id = p_entry_id
      and w.status = 'cancelled'
      and w.updated_at > now() - interval '2 minutes'
  ),
  live as (
    select w.customer_id,
      (row_number() over (order by w."position"))::int as rnk
    from public.waitlist_entries w, me
    where w.branch_id = me.branch_id
      and w.zone is not distinct from me.zone
      and w.status in ('waiting','notified')
      and (w.joined_at at time zone 'Asia/Riyadh')::date
        = (now() at time zone 'Asia/Riyadh')::date
  )
  select ps.endpoint, ps.p256dh, ps.auth, live.rnk, r.name, r.slug
  from live
  join public.push_subscriptions ps on ps.customer_id = live.customer_id
  cross join me
  join public.branches b on b.id = me.branch_id
  join public.restaurants r on r.id = b.restaurant_id;
$function$;

revoke all on function public.queue_push_targets_after_ticket_cancel(uuid) from public;
grant execute on function public.queue_push_targets_after_ticket_cancel(uuid) to anon, authenticated;
