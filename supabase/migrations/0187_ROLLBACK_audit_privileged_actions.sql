-- ═══ تراجع ٠١٨٦ — يعيد الدوالّ الخمس إلى نسخها قبل إضافة التدقيق ═══
create or replace function public.set_staff_permission(p_staff_id uuid, p_perm text, p_granted boolean)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
DECLARE rid uuid; bid uuid;
BEGIN
  SELECT restaurant_id, branch_id INTO rid, bid FROM public.staff WHERE id = p_staff_id;
  IF rid IS NULL THEN RETURN; END IF;
  IF NOT (public.is_manager_of(rid) OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF public.caller_branch_id(rid) IS NOT NULL
     AND (bid IS NULL OR NOT public.can_access_branch(bid)) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_perm NOT IN ('waitlist','reservations','analytics','customers','reviews','settings','team') THEN
    RAISE EXCEPTION 'invalid permission';
  END IF;
  UPDATE public.staff
  SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(p_perm, p_granted)
  WHERE id = p_staff_id;
END;
$function$;

create or replace function public.set_branch_status(p_branch_id uuid, p_manually_closed boolean, p_busy_now boolean)
 returns boolean language plpgsql security definer set search_path to ''
as $function$
begin
  if not ( public.is_platform_admin()
    or (public.is_staff_of(public.restaurant_of_branch(p_branch_id)) and public.can_access_branch(p_branch_id))
  ) then return false; end if;
  update public.branch_settings
     set manually_closed = p_manually_closed, busy_now = p_busy_now, updated_at = now()
   where branch_id = p_branch_id;
  return found;
end;
$function$;

create or replace function public.set_branch_join_frozen(p_branch_id uuid, p_frozen boolean, p_reason text default null::text)
 returns boolean language plpgsql security definer set search_path to ''
as $function$
declare v_frozen boolean := coalesce(p_frozen,false); v_reason text;
begin
  if not ( public.is_platform_admin()
    or (public.is_staff_of(public.restaurant_of_branch(p_branch_id)) and public.can_access_branch(p_branch_id))
  ) then return false; end if;
  v_reason := case when not v_frozen then null
                   when p_reason in ('done_today','temporary') then p_reason else null end;
  update public.branch_settings
     set join_frozen = v_frozen, join_frozen_reason = v_reason, updated_at = now()
   where branch_id = p_branch_id;
  return found;
end;
$function$;

create or replace function public.admin_delete_restaurant(p_restaurant_id uuid)
 returns void language plpgsql security definer set search_path to ''
as $function$
declare v_owner uuid; v_uid uuid; v_candidates uuid[];
begin
  if not public.is_platform_admin() then
    raise exception 'غير مصرّح' using errcode = '42501';
  end if;
  select owner_id into v_owner from public.restaurants where id = p_restaurant_id;
  select array_agg(distinct u) into v_candidates
  from ( select user_id as u from public.staff where restaurant_id = p_restaurant_id
         union select v_owner where v_owner is not null ) s
  where u is not null;
  delete from public.restaurants where id = p_restaurant_id;
  if v_candidates is not null then
    foreach v_uid in array v_candidates loop
      if not exists (select 1 from public.staff where user_id = v_uid)
         and not exists (select 1 from public.restaurants where owner_id = v_uid)
         and not exists (select 1 from public.platform_admins where user_id = v_uid)
      then delete from auth.users where id = v_uid; end if;
    end loop;
  end if;
end;
$function$;

-- restore_queue_entry: نزع كتلة التدقيق بالمرساة نفسها
do $rb$
declare d text; d2 text;
begin
  select pg_get_functiondef(oid) into d from pg_proc
   where proname='restore_queue_entry' and pronamespace='public'::regnamespace;
  d2 := regexp_replace(d,
    E'  insert into public\\.admin_audit[^;]+;\\n\\n  return v_new_id;', E'  return v_new_id;');
  if d2 = d then raise notice 'كتلة التدقيق غير موجودة أصلًا — لا تراجع مطلوب'; else execute d2; end if;
end $rb$;
