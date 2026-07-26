-- دوال SECURITY DEFINER تتجاوز RLS، فلا بدّ أن تفحص الفرع بنفسها.

-- ١) أهداف إشعارات الطابور: كانت تكتفي بـ«موظّف في المطعم» فيقدر موظّف الفرع أ
--    على سحب اشتراكات دفع عملاء الفرع ب.
create or replace function public.queue_push_targets(p_branch_id uuid, p_zone text)
returns table(entry_id uuid, rank integer, endpoint text, p256dh text, auth text)
language sql stable security definer set search_path to ''
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
  where public.can_access_branch(p_branch_id);
$function$;

-- ٢) صلاحيات الفريق: مدير فرع لا يعدّل موظّفي فرع آخر.
create or replace function public.set_staff_permission(p_staff_id uuid, p_perm text, p_granted boolean)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
DECLARE rid uuid; bid uuid;
BEGIN
  SELECT restaurant_id, branch_id INTO rid, bid FROM public.staff WHERE id = p_staff_id;
  IF rid IS NULL THEN RETURN; END IF;
  IF NOT (public.is_manager_of(rid) OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  -- عزل الفرانشايز: الموظّف المربوط بفرع لا يُعدَّل إلا ممّن يصل إلى فرعه
  IF bid IS NOT NULL AND NOT public.can_access_branch(bid) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_perm NOT IN ('waitlist','reservations','analytics','offers','loyalty','customers','reviews','settings','menu','team') THEN
    RAISE EXCEPTION 'invalid permission';
  END IF;
  UPDATE public.staff
  SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(p_perm, p_granted)
  WHERE id = p_staff_id;
END;
$function$;

-- ٣) فتح ملف العميل: زيارة في فرع يصل إليه المتصل، لا أيّ فرع في المطعم.
create or replace function public.staff_can_read_customer(cust_id uuid)
returns boolean
language sql stable security definer set search_path to ''
as $function$
  select exists (
    select 1 from public.reservations r
    where r.customer_id = cust_id and public.can_access_branch(r.branch_id)
  )
  or exists (
    select 1 from public.waitlist_entries w
    where w.customer_id = cust_id and public.can_access_branch(w.branch_id)
  );
$function$;
