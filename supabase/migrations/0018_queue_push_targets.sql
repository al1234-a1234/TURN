-- ============================================================================
--  أهداف إشعار «تقدّم دورك» — كل من تغيّر ترتيبه بعد إجلاس/إزالة من أمامه.
--  يُرجع لكل صفٍّ حيّ في (الفرع + القسم + اليوم): ترتيبه الجديد + اشتراكاته.
--  يُستدعى من الخادم بعد تغيير حالة أي صف، فيُرسل التطبيق الإشعار تلقائيًّا
--  بلا أي ضغطة إضافية من الاستقبال.
--  للموظّف المخوّل في مطعم ذلك الفرع فقط.
-- ============================================================================
create or replace function public.queue_push_targets(p_branch_id uuid, p_zone text)
 returns table(entry_id uuid, rank integer, endpoint text, p256dh text, auth text)
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  with live as (
    select
      w.id,
      w.customer_id,
      (row_number() over (order by w."position"))::int as rnk
    from public.waitlist_entries w
    where w.branch_id = p_branch_id
      and w.zone is not distinct from p_zone
      and w.status in ('waiting','notified')
      and (w.joined_at at time zone 'Asia/Riyadh')::date
        = (now() at time zone 'Asia/Riyadh')::date
  )
  select l.id, l.rnk, ps.endpoint, ps.p256dh, ps.auth
  from live l
  join public.push_subscriptions ps on ps.customer_id = l.customer_id
  where public.is_staff_of(public.restaurant_of_branch(p_branch_id));
$function$;

revoke all on function public.queue_push_targets(uuid, text) from public;
grant execute on function public.queue_push_targets(uuid, text) to authenticated;
