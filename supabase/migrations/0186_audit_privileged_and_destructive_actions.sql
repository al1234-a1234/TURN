-- ═══ المهمّة ١ — أثرٌ دائم للأفعال المُصعِّدة والمُتلِفة (HIGH §١١) ═══
--
-- admin_audit كان يحمل ثلاثة أنواعٍ فقط عبر ١٦٧٦ صفًّا: canary.provision،
-- delete:reservations، delete:waitlist_entries. فمن يمنح نفسه صلاحية، أو
-- يقفل فرعًا، أو يحذف مطعمًا — لا يترك أثرًا. وهذا يُفرغ إصلاح HIGH-1 من
-- معناه: صارت الخريطة تُفرَض، وتغييرُها غير مرئيّ.
--
-- خمسة مسارات تكتب الآن صفًّا واحدًا مضغوطًا: الفاعل، الهدف، قبل، بعد.
-- والكتابة **عند التغيّر فقط** — لا صفَّ لمنحٍ لا يغيّر شيئًا. وadmin_audit
-- لا يُنظَّف (بلا مفاتيح أجنبيّة وبلا حذف)، فالإسهاب فيه دَينٌ دائم.
--
-- أُثبت على المحاكاة ببصمةٍ مطابقة للإنتاج (٥/٥) قبل هذا التطبيق —
-- كلّ فعلٍ أنتج صفًّا واحدًا بالضبط وبقيمٍ صحيحة:
--   perm:set           ×1  {"to":true,"from":false,"perm":"customers","staff":"…"}
--   branch:status      ×1  {"busy":[false,false],"closed":[false,true]}
--   branch:join_frozen ×1  {"frozen":[false,true],"reason":[null,"done_today"]}
--   queue:restore      ×1  {"to_entry":"…","from_entry":"…","from_status":"cancelled"}
--   restaurant:delete  ×1  {"name":"…","slug":"…","staff_candidates":2}
--
-- التراجع: 0187_ROLLBACK_audit_privileged_actions.sql

create or replace function public.set_staff_permission(p_staff_id uuid, p_perm text, p_granted boolean)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
DECLARE rid uuid; bid uuid; v_before boolean;
BEGIN
  SELECT restaurant_id, branch_id, coalesce((permissions->>p_perm)::boolean,false)
    INTO rid, bid, v_before FROM public.staff WHERE id = p_staff_id;
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
  IF v_before IS DISTINCT FROM coalesce(p_granted,false) THEN
    INSERT INTO public.admin_audit (actor, action, restaurant_id, branch_id, detail)
    VALUES ((select auth.uid()), 'perm:set', rid, bid,
            jsonb_build_object('staff', p_staff_id, 'perm', p_perm,
                               'from', v_before, 'to', coalesce(p_granted,false)));
  END IF;
END;
$function$;

create or replace function public.set_branch_status(p_branch_id uuid, p_manually_closed boolean, p_busy_now boolean)
 returns boolean language plpgsql security definer set search_path to ''
as $function$
declare v_c boolean; v_b boolean;
begin
  if not ( public.is_platform_admin()
    or (public.is_staff_of(public.restaurant_of_branch(p_branch_id)) and public.can_access_branch(p_branch_id))
  ) then return false; end if;

  select manually_closed, busy_now into v_c, v_b
    from public.branch_settings where branch_id = p_branch_id;

  update public.branch_settings
     set manually_closed = p_manually_closed, busy_now = p_busy_now, updated_at = now()
   where branch_id = p_branch_id;

  if found and (v_c is distinct from p_manually_closed or v_b is distinct from p_busy_now) then
    insert into public.admin_audit (actor, action, restaurant_id, branch_id, detail)
    values ((select auth.uid()), 'branch:status',
            public.restaurant_of_branch(p_branch_id), p_branch_id,
            jsonb_build_object('closed', jsonb_build_array(v_c, p_manually_closed),
                               'busy',   jsonb_build_array(v_b, p_busy_now)));
  end if;
  return found;
end;
$function$;

create or replace function public.set_branch_join_frozen(p_branch_id uuid, p_frozen boolean, p_reason text default null::text)
 returns boolean language plpgsql security definer set search_path to ''
as $function$
declare
  v_frozen boolean := coalesce(p_frozen, false);
  v_reason text; v_of boolean; v_or text;
begin
  if not ( public.is_platform_admin()
    or (public.is_staff_of(public.restaurant_of_branch(p_branch_id)) and public.can_access_branch(p_branch_id))
  ) then return false; end if;

  v_reason := case when not v_frozen then null
                   when p_reason in ('done_today','temporary') then p_reason
                   else null end;

  select join_frozen, join_frozen_reason into v_of, v_or
    from public.branch_settings where branch_id = p_branch_id;

  update public.branch_settings
     set join_frozen = v_frozen, join_frozen_reason = v_reason, updated_at = now()
   where branch_id = p_branch_id;

  if found and (v_of is distinct from v_frozen or v_or is distinct from v_reason) then
    insert into public.admin_audit (actor, action, restaurant_id, branch_id, detail)
    values ((select auth.uid()), 'branch:join_frozen',
            public.restaurant_of_branch(p_branch_id), p_branch_id,
            jsonb_build_object('frozen', jsonb_build_array(v_of, v_frozen),
                               'reason', jsonb_build_array(v_or, v_reason)));
  end if;
  return found;
end;
$function$;

create or replace function public.admin_delete_restaurant(p_restaurant_id uuid)
 returns void language plpgsql security definer set search_path to ''
as $function$
declare
  v_owner uuid; v_uid uuid; v_candidates uuid[];
  v_slug text; v_name text;
begin
  if not public.is_platform_admin() then
    raise exception 'غير مصرّح' using errcode = '42501';
  end if;

  select owner_id, slug, name into v_owner, v_slug, v_name
    from public.restaurants where id = p_restaurant_id;

  select array_agg(distinct u) into v_candidates
  from ( select user_id as u from public.staff where restaurant_id = p_restaurant_id
         union select v_owner where v_owner is not null ) s
  where u is not null;

  -- الأثر قبل الحذف: بعده لا يبقى اسمٌ ولا مُعرّف يُقرأ. وadmin_audit بلا
  -- مفاتيح أجنبيّة (PK وحده)، فالصفّ يبقى صالحًا بعد زوال المطعم.
  insert into public.admin_audit (actor, action, restaurant_id, branch_id, detail)
  values ((select auth.uid()), 'restaurant:delete', p_restaurant_id, null,
          jsonb_build_object('slug', v_slug, 'name', v_name,
                             'staff_candidates', coalesce(array_length(v_candidates,1),0)));

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

-- restore_queue_entry: استبدالٌ مرتكز — الدالّة طويلة وإعادة كتابتها تُعيد
-- أيّ انحرافٍ حيٍّ لا نعلمه (نفس منطق ٠١٧٣).
do $mig$
declare d text; d2 text;
begin
  select pg_get_functiondef(oid) into d from pg_proc
   where proname='restore_queue_entry' and pronamespace='public'::regnamespace;
  d2 := replace(d, E'  return v_new_id;\nend;',
    E'  insert into public.admin_audit (actor, action, restaurant_id, branch_id, detail)\n'
    '  values ((select auth.uid()), ''queue:restore'',\n'
    '          public.restaurant_of_branch(v_old.branch_id), v_old.branch_id,\n'
    '          jsonb_build_object(''from_entry'', p_entry_id, ''to_entry'', v_new_id,\n'
    '                             ''from_status'', v_old.status::text));\n\n'
    '  return v_new_id;\nend;');
  if d2 = d then raise exception 'مرساة restore_queue_entry لم تُطابق'; end if;
  execute d2;
end $mig$;

-- حارسٌ دائم w53: لا تعود إحدى الخمس بلا أثر
do $mig2$
declare d text; d2 text; v_new text;
begin
  select pg_get_functiondef(oid) into d
    from pg_proc where proname='run_critical_checks' and pronamespace='public'::regnamespace;
  v_new :=
       E'    (''w53_privileged_actions_audited'', not exists (\n'
    || E'        select 1 from (values\n'
    || E'            (''set_staff_permission'',''perm:set''),\n'
    || E'            (''set_branch_status'',''branch:status''),\n'
    || E'            (''set_branch_join_frozen'',''branch:join_frozen''),\n'
    || E'            (''admin_delete_restaurant'',''restaurant:delete''),\n'
    || E'            (''restore_queue_entry'',''queue:restore'')\n'
    || E'          ) as t(fn, act)\n'
    || E'         where not exists (select 1 from pg_proc p\n'
    || E'                            where p.proname = t.fn\n'
    || E'                              and p.pronamespace = ''public''::regnamespace\n'
    || E'                              and pg_get_functiondef(p.oid) like ''%'' || t.act || ''%''))),\n';
  d2 := replace(d, E'    (''q20_schema_no_drift'',', v_new || E'    (''q20_schema_no_drift'',');
  if d2 = d then raise exception 'مرساة q20 لم تُطابق'; end if;
  execute d2;
end $mig2$;

do $verify$
declare v_fail text; v_w53 boolean;
begin
  select coalesce(string_agg(name,'، ') filter (where not pass),'—') into v_fail
    from public.run_critical_checks();
  select pass into v_w53 from public.run_critical_checks() where name='w53_privileged_actions_audited';
  if v_w53 is null then raise exception 'w53 لم يُضف'; end if;
  if not v_w53 then raise exception 'w53 راسب فور إضافته'; end if;
  if v_fail <> '—' then raise exception 'فحوصٌ راسبة: %', v_fail; end if;
end
$verify$;