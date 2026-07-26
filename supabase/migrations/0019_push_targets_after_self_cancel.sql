-- ============================================================================
--  ثغرة: إلغاء العميل دوره بنفسه (cancel_waitlist_guest) كان يقدّم من خلفه
--  بلا أي إشعار، لأن الإشعار التلقائي كان معلّقًا على إجراءات الاستقبال فقط.
--
--  هذه الدالة تُغلقها: بعد إلغاء ذاتي مُتحقَّق منه، تُرجع من تقدّم دوره
--  في نفس (الفرع + القسم + اليوم) مع اشتراكاته واسم المطعم.
--
--  الحارس (مشدّد عمدًا لأنها متاحة للضيف anon):
--    ١) لا بد أن يتطابق (معرّف الصف + رقم الجوّال) — نفس نمط بقية دوال الضيف.
--    ٢) لا بد أن تكون حالة الصف 'cancelled' فعلًا.
--    ٣) لا بد أن يكون الإلغاء خلال دقيقتين — فلا تُستدعى إلا عقب إلغاء حقيقي.
-- ============================================================================
create or replace function public.queue_push_targets_after_cancel(
  p_entry_id uuid,
  p_phone    text
)
 returns table(endpoint text, p256dh text, auth text, rank integer, venue text, slug text)
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  with me as (
    select w.branch_id, w.zone
    from public.waitlist_entries w
    join public.customers c on c.id = w.customer_id
    where w.id = p_entry_id
      and c.phone = trim(p_phone)
      and w.status = 'cancelled'
      and w.updated_at > now() - interval '2 minutes'
  ),
  live as (
    select
      w.customer_id,
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

revoke all on function public.queue_push_targets_after_cancel(uuid, text) from public;
grant execute on function public.queue_push_targets_after_cancel(uuid, text) to anon, authenticated;
