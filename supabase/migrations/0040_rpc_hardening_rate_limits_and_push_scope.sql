-- تحصين دوال RPC بعد مراجعة مستشار الأمان:
--   ١) push_subs_for_entry كانت بحارس مطعم لا فرع — موظّف فرع أ يسحب مفاتيح
--      دفع عميل في فرع ب. صارت can_access_branch.
--   ٢) حدّ معدّل على public_checkin (تلويث CRM بأرقام عشوائية) وعلى
--      استعلامات الولاء/الهدايا بالرقم (كبح التعداد — بلا IP متاح، المفتاح
--      هو الرقم نفسه فيُبطئ استهداف رقم بعينه ويترك الاستخدام الشرعي حرًّا).
--   ٣) سحب EXECUTE عن دوال التريغرات المكشوفة عبر REST (نظافة سطح الهجوم).
--
-- اختُبر حيًّا: ٦ مسحات تمرّ والسابعة تُرفض، والهدية الأولى تصدر كما هي.

-- ١) مفاتيح الدفع تتبع الفرع
create or replace function public.push_subs_for_entry(p_entry_id uuid)
returns table(endpoint text, p256dh text, auth text)
language sql stable security definer set search_path to ''
as $function$
  select ps.endpoint, ps.p256dh, ps.auth
  from public.waitlist_entries w
  join public.push_subscriptions ps on ps.customer_id = w.customer_id
  where w.id = p_entry_id
    and public.can_access_branch(w.branch_id);
$function$;

-- ٢أ) المسح: ٦/يوم لكل رقم (زيارة كل ٤ ساعات = ٦ حدّ أقصى شرعي) + ١٢٠/ساعة لكل فرع
create or replace function public.public_checkin(p_slug text, p_phone text, p_name text default null, p_branch_id uuid default null)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_norm text; v_rid uuid; v_rname text; v_rlogo text; v_branch uuid; v_cid uuid;
  v_last timestamptz; v_recent boolean; v_is_first boolean; v_visits integer; v_points integer;
  v_set public.checkin_settings%rowtype; v_loy public.loyalty_programs%rowtype;
  v_gift jsonb := null; v_loyrew jsonb := null; v_gift_id uuid;
begin
  v_norm := public.norm_phone_input(p_phone);
  if length(v_norm) <> 9 then
    return jsonb_build_object('ok', false, 'error', 'invalid_phone');
  end if;

  -- حدّ المعدّل بالرقم قبل أي كتابة
  if not public.check_rate('checkin:p:' || v_norm, 6, interval '1 day') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select r.id, r.name, r.logo_url into v_rid, v_rname, v_rlogo
  from public.restaurants r where r.slug = p_slug and r.is_active limit 1;
  if v_rid is null then
    return jsonb_build_object('ok', false, 'error', 'restaurant_not_found');
  end if;

  select b.id into v_branch from public.branches b
  where b.id = p_branch_id and b.restaurant_id = v_rid and b.is_active;
  if v_branch is null then
    select b.id into v_branch from public.branches b
    where b.restaurant_id = v_rid and b.is_active order by b.created_at limit 1;
  end if;

  -- حدّ المعدّل بالفرع (إغراق جماعي)
  if not public.check_rate('checkin:b:' || coalesce(v_branch::text,'-'), 120, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select c.id into v_cid from public.customers c
  where right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 9) = v_norm
  order by c.created_at limit 1;

  if v_cid is null then
    insert into public.customers (full_name, phone)
    values (nullif(btrim(coalesce(p_name,'')), ''), '0' || v_norm) returning id into v_cid;
  elsif nullif(btrim(coalesce(p_name,'')), '') is not null then
    update public.customers set full_name = coalesce(nullif(btrim(full_name),''), btrim(p_name)), updated_at = now()
      where id = v_cid;
  end if;

  insert into public.customer_restaurant (restaurant_id, customer_id, visits, points, first_seen, last_visit)
  values (v_rid, v_cid, 0, 0, now(), now())
  on conflict (restaurant_id, customer_id) do nothing;

  select max(created_at) into v_last from public.checkins where restaurant_id = v_rid and customer_id = v_cid;
  v_is_first := v_last is null;
  v_recent   := v_last is not null and v_last > now() - interval '4 hours';

  select * into v_visits, v_points from (
    select visits, points from public.customer_restaurant where restaurant_id = v_rid and customer_id = v_cid) s;

  select * into v_loy from public.loyalty_programs where restaurant_id = v_rid and is_active;

  if not v_recent then
    insert into public.checkins (restaurant_id, branch_id, customer_id) values (v_rid, v_branch, v_cid);
    v_visits := coalesce(v_visits,0) + 1;
    v_points := coalesce(v_points,0) + coalesce(v_loy.points_per_visit, 0);

    if v_loy.restaurant_id is not null and coalesce(v_loy.reward_threshold,0) > 0
       and v_points >= v_loy.reward_threshold then
      insert into public.customer_rewards (restaurant_id, customer_id, kind, title, value_kind, description, status, expires_at)
      values (v_rid, v_cid, 'gift', coalesce(nullif(btrim(v_loy.reward_description),''), 'مكافأة الولاء'),
              'percent', 'مكافأة إتمام نقاط الولاء', 'active', now() + interval '30 days');
      v_points := v_points - v_loy.reward_threshold;
      v_loyrew := jsonb_build_object('title', coalesce(nullif(btrim(v_loy.reward_description),''), 'مكافأة الولاء'));
    end if;

    update public.customer_restaurant set visits = v_visits, points = v_points, last_visit = now(), updated_at = now()
      where restaurant_id = v_rid and customer_id = v_cid;
  end if;

  if v_is_first then
    select * into v_set from public.checkin_settings where branch_id = v_branch;
    if v_set.branch_id is not null and v_set.welcome_enabled then
      insert into public.customer_rewards
        (restaurant_id, customer_id, kind, title, value, value_kind, description, status, expires_at)
      values
        (v_rid, v_cid, v_set.welcome_kind, v_set.welcome_title, v_set.welcome_value, v_set.welcome_value_kind,
         'هدية ترحيب أول زيارة', 'active', now() + (v_set.welcome_expires_days || ' days')::interval)
      returning id into v_gift_id;
      v_gift := jsonb_build_object('id', v_gift_id, 'title', v_set.welcome_title, 'kind', v_set.welcome_kind,
        'value', v_set.welcome_value, 'value_kind', v_set.welcome_value_kind, 'expires_days', v_set.welcome_expires_days);
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'restaurant', jsonb_build_object('name', v_rname, 'logo_url', v_rlogo, 'slug', p_slug),
    'phone', '0' || v_norm,
    'is_first_visit', v_is_first, 'is_recent', v_recent,
    'visits', coalesce(v_visits,0), 'points', coalesce(v_points,0),
    'loyalty', case when v_loy.restaurant_id is not null
                    then jsonb_build_object('points_per_visit', v_loy.points_per_visit, 'threshold', v_loy.reward_threshold)
                    else null end,
    'gift', v_gift, 'loyalty_reward', v_loyrew);
end;
$function$;

-- ٢ب) استعلامات الرقم: ٦٠/ساعة لكل رقم — الشرعي يفتح صفحته مرات معدودة
create or replace function public.get_customer_rewards(p_phone text)
returns table(id uuid, restaurant text, restaurant_slug text, kind text, title text, value numeric, value_kind text, description text, code text, status text, expires_at timestamptz, created_at timestamptz, redeemed_at timestamptz)
language plpgsql security definer set search_path to ''
as $function$
begin
  if length(public.norm_phone_input(p_phone)) <> 9 then return; end if;
  if not public.check_rate('rewards:p:' || public.norm_phone_input(p_phone), 60, interval '1 hour') then return; end if;
  return query
  select cr.id, r.name, r.slug, cr.kind, cr.title, cr.value, cr.value_kind,
         cr.description, cr.code, cr.status, cr.expires_at, cr.created_at, cr.redeemed_at
  from public.customer_rewards cr
  join public.customers c on c.id = cr.customer_id
  join public.restaurants r on r.id = cr.restaurant_id
  where right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 9) = public.norm_phone_input(p_phone)
    and cr.status in ('active','redeemed')
    and (cr.status = 'redeemed' or cr.expires_at is null or cr.expires_at > now())
  order by (cr.status = 'active') desc, cr.created_at desc;
end $function$;

create or replace function public.get_customer_loyalty(p_phone text)
returns table(restaurant text, restaurant_slug text, points integer, reward_threshold integer, reward_description text)
language plpgsql security definer set search_path to ''
as $function$
begin
  if length(public.norm_phone_input(p_phone)) <> 9 then return; end if;
  if not public.check_rate('loyalty:p:' || public.norm_phone_input(p_phone), 60, interval '1 hour') then return; end if;
  return query
  select r.name, r.slug, cr.points, lp.reward_threshold, lp.reward_description
  from public.customer_restaurant cr
  join public.customers c on c.id = cr.customer_id
  join public.restaurants r on r.id = cr.restaurant_id
  join public.loyalty_programs lp on lp.restaurant_id = cr.restaurant_id and lp.is_active
  where right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 9) = public.norm_phone_input(p_phone)
    and cr.points > 0
  order by cr.points desc;
end $function$;

-- ٣) دوال التريغرات لا تُستدعى عبر REST
revoke execute on function public.set_waitlist_position() from public, anon, authenticated;
revoke execute on function public.on_waitlist_status_change() from public, anon, authenticated;
revoke execute on function public.create_default_branch_settings() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
