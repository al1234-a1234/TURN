-- ثلاثة ثقوب «على مستوى العلامة» بقيت مفتوحة لموظّف مربوط بفرع:
--   ١) حملة هدايا لشريحة → كانت تشمل عملاء كل الفروع.
--   ٢) اسم/شعار/روابط المطعم → كان يعدّلها مدير فرع واحد للعلامة كلها.
--   ٣) صلاحيات موظّف «بلا فرع» (موظّف العلامة) → كان يعدّلها مدير فرع.

-- فرع المتصل داخل مطعم بعينه (NULL = غير مربوط = مستوى العلامة)
create or replace function public.caller_branch_id(rest_id uuid)
returns uuid
language sql stable security definer set search_path to ''
as $function$
  select s.branch_id
  from public.staff s
  where s.user_id = (select auth.uid())
    and s.is_active
    and s.restaurant_id = rest_id
  order by (s.branch_id is null) desc   -- الأوسع صلاحيةً أوّلًا
  limit 1;
$function$;

-- مدير على مستوى العلامة: غير مربوط بفرع (أو مشرف منصّة)
create or replace function public.is_brand_manager(rest_id uuid)
returns boolean
language sql stable security definer set search_path to ''
as $function$
  select public.is_platform_admin() or exists (
    select 1 from public.staff s
    where s.user_id = (select auth.uid())
      and s.is_active
      and s.restaurant_id = rest_id
      and s.branch_id is null
      and s.role in ('owner','manager')
  );
$function$;

-- ١) الحملة: من ربطه فرع لا يهدي إلا من زار فرعه
create or replace function public.grant_reward_to_segment(
  p_restaurant_id uuid, p_segment text, p_kind text, p_title text,
  p_value numeric, p_value_kind text, p_description text, p_code text,
  p_expires_at timestamp with time zone)
returns integer
language plpgsql security definer set search_path to 'public'
as $function$
declare n integer; v_branch uuid;
begin
  if not (public.staff_has_perm(p_restaurant_id, 'customers') or public.is_platform_admin()) then
    return 0;
  end if;
  if coalesce(trim(p_title),'') = '' then return 0; end if;

  v_branch := public.caller_branch_id(p_restaurant_id);

  insert into public.customer_rewards
    (restaurant_id, customer_id, kind, title, value, value_kind, description, code, created_by, expires_at)
  select p_restaurant_id, cr.customer_id,
         case when p_kind='discount' then 'discount' else 'gift' end,
         p_title,
         case when p_kind='discount' then p_value else null end,
         coalesce(nullif(p_value_kind,''),'percent'),
         nullif(trim(p_description),''),
         nullif(upper(trim(p_code)),''),
         (select auth.uid()),
         p_expires_at
  from public.customer_restaurant cr
  where cr.restaurant_id = p_restaurant_id
    and case p_segment
          when 'vip' then cr.is_vip
          when 'gold' then cr.tier = 'gold'
          when 'silver' then cr.tier = 'silver'
          when 'returning' then cr.visits >= 2
          else true
        end
    -- عزل الفرانشايز: لا تتجاوز الحملة عملاء فرع المتصل
    and (
      v_branch is null
      or exists (select 1 from public.waitlist_entries w
                 where w.customer_id = cr.customer_id and w.branch_id = v_branch)
      or exists (select 1 from public.reservations r
                 where r.customer_id = cr.customer_id and r.branch_id = v_branch)
    );
  get diagnostics n = row_count;
  return n;
end $function$;

-- ٢) هوية العلامة (الاسم، الشعار، الروابط، الوصف) لمالك العلامة وحده
drop policy if exists "manager or admin updates restaurant" on public.restaurants;
create policy "manager or admin updates restaurant" on public.restaurants
  for update using (public.is_brand_manager(id)) with check (public.is_brand_manager(id));

-- ٣) صلاحيات الفريق: مدير الفرع لا يمسّ موظّفي العلامة (branch_id IS NULL)
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
  -- مربوط بفرع: لا يعدّل إلا موظّفي فرعه (وموظّف العلامة فوقه، لا تحته)
  IF public.caller_branch_id(rid) IS NOT NULL
     AND (bid IS NULL OR NOT public.can_access_branch(bid)) THEN
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

-- المسندان يُقرآن داخل سياسات RLS، فيحتاج كل دور يقرأ تلك الجداول صلاحية
-- تنفيذهما (وإلا صار الرفض خطأً بدل نتيجة فارغة). ولا يكشفان شيئًا: بلا
-- auth.uid() يعودان دائمًا false/NULL — تمامًا كـ is_staff_of و can_access_branch.
grant execute on function public.caller_branch_id(uuid) to authenticated, anon;
grant execute on function public.is_brand_manager(uuid) to authenticated, anon;

-- ٤) owner_insights مولَّدة بتجميع كل فروع المطعم (run_daily_digest / walkaway)
-- وتضمّ أحيانًا اسم عميل. لا تصلح لموظّف مربوط بفرع: تعطيه أرقام غيره وتلتفّ
-- حول عزل العملاء. حتى تصير التقارير لكل فرع، نقصرها على مستوى العلامة.
drop policy if exists "staff reads own insights" on public.owner_insights;
create policy "staff reads own insights" on public.owner_insights
  for select using (public.is_brand_manager(restaurant_id));

drop policy if exists "managers update own insights" on public.owner_insights;
create policy "managers update own insights" on public.owner_insights
  for update using (public.is_brand_manager(restaurant_id))
  with check (public.is_brand_manager(restaurant_id));
