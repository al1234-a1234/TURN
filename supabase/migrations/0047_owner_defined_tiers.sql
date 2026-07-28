-- الطبقات المعرَّفة من المالك — أسماء وعتبات ومزايا يقرّرها هو.
--
-- قبل هذا الترحيل كانت الترقية مثبّتة في الكود (فضّي@٥، ذهبي@١٥) وداخل
-- مسار واحد فقط (إجلاس الطابور) — **زيارات المسح لم تكن ترقّي أبدًا**،
-- فعميل يمسح ٢٠ مرّة يبقى بلا طبقة وجاره الذي جلس ٥ مرات فضّي.
--
-- التصميم: config واحد في loyalty_programs، ودالة واحدة tier_for_visits
-- يستدعيها المساران (الإجلاس والمسح) — مصدر حقيقة واحد لا نسختان تتباعدان.
-- المفاتيح ('silver','gold') ثابتة لأن customer_restaurant.tier يخزّنها
-- ولوحات التقسيم تصفّي بها؛ المالك يملك الاسم المعروض والعتبة والميزة.

-- ── ١) الإعداد ──
alter table public.loyalty_programs
  add column if not exists tier_config jsonb not null default
  '[{"key":"silver","name":"فضّي","visits":5,"perk":""},{"key":"gold","name":"ذهبي","visits":15,"perk":""}]'::jsonb;

comment on column public.loyalty_programs.tier_config is
  'مصفوفة {key,name,visits,perk} مرتبة تصاعديًّا — المفاتيح ثابتة والأسماء والعتبات للمالك';

-- ── ٢) مصدر الحقيقة الواحد للترقية ──
create or replace function public.tier_for_visits(p_rid uuid, p_visits integer)
returns text
language sql stable security definer set search_path to ''
as $function$
  select t.key from (
    select elem->>'key' as key, (elem->>'visits')::int as visits
    from public.loyalty_programs lp,
         jsonb_array_elements(coalesce(lp.tier_config, '[]'::jsonb)) elem
    where lp.restaurant_id = p_rid
  ) t
  where t.visits is not null and t.visits > 0 and p_visits >= t.visits
  order by t.visits desc
  limit 1;
$function$;

revoke execute on function public.tier_for_visits(uuid, integer) from public, anon, authenticated;

-- ── ٣) مسار الإجلاس يقرأ الإعداد بدل الأرقام المثبّتة ──
create or replace function public.on_waitlist_status_change()
returns trigger
language plpgsql security definer set search_path to 'public'
as $function$
declare
  rid uuid;
  pts int := 0;
  cust_name text;
  v_threshold int;
  v_reward_desc text;
  v_points int;
  v_scanned_recently boolean;
begin
  if new.customer_id is null then return new; end if;
  rid := public.restaurant_of_branch(new.branch_id);

  if new.status = 'seated' and old.status is distinct from 'seated'
     and new.visit_counted_at is null then
    -- زيارة واحدة لكل صف مهما تقلّبت الحالة
    update public.waitlist_entries set visit_counted_at = now() where id = new.id;

    -- لو مسح العميل QR قبل قليل فقد حُسبت الزيارة والنقاط هناك — لا نكرّر
    select exists (
      select 1 from public.checkins ck
      where ck.restaurant_id = rid and ck.customer_id = new.customer_id
        and ck.created_at > now() - interval '4 hours'
    ) into v_scanned_recently;

    select coalesce(points_per_visit,0), reward_threshold, reward_description
      into pts, v_threshold, v_reward_desc
      from public.loyalty_programs where restaurant_id = rid and is_active;
    pts := case when v_scanned_recently then 0 else coalesce(pts, 0) end;

    insert into public.customer_restaurant (restaurant_id, customer_id, visits, points, last_visit, first_seen)
    values (rid, new.customer_id, case when v_scanned_recently then 0 else 1 end, pts,
            coalesce(new.seated_at, now()), now())
    on conflict (restaurant_id, customer_id) do update set
      visits = customer_restaurant.visits + (case when excluded.visits = 0 then 0 else 1 end),
      points = customer_restaurant.points + excluded.points,
      last_visit = greatest(customer_restaurant.last_visit, excluded.last_visit),
      tier = coalesce(public.tier_for_visits(rid,
               customer_restaurant.visits + (case when excluded.visits = 0 then 0 else 1 end)),
             customer_restaurant.tier),
      updated_at = now();

    if not v_scanned_recently and v_threshold is not null and v_threshold > 0 then
      select points into v_points from public.customer_restaurant
        where restaurant_id = rid and customer_id = new.customer_id;
      if v_points >= v_threshold then
        insert into public.customer_rewards (restaurant_id, customer_id, kind, title, description, status, expires_at)
        values (rid, new.customer_id, 'gift',
                coalesce(nullif(v_reward_desc,''), 'مكافأة الولاء 🎁'),
                'وصلت للحد المطلوب من نقاط الولاء — استمتع بمكافأتك!', 'active', now() + interval '90 days');
        update public.customer_restaurant set points = points - v_threshold
          where restaurant_id = rid and customer_id = new.customer_id;
      end if;
    end if;

  elsif new.status = 'no_show' and old.status is distinct from 'no_show' then
    insert into public.customer_restaurant (restaurant_id, customer_id, no_shows, first_seen)
    values (rid, new.customer_id, 1, now())
    on conflict (restaurant_id, customer_id) do update set
      no_shows = customer_restaurant.no_shows + 1, updated_at = now();

  elsif new.status = 'cancelled' and old.status in ('waiting','notified')
        and public.has_feature(rid, 'walkaway') then
    select full_name into cust_name from public.customers where id = new.customer_id;
    insert into public.owner_insights (restaurant_id, kind, title, body, data)
    values (rid, 'walkaway', 'عميل غادر الطابور',
      coalesce(cust_name, 'عميل') || ' غادر قبل دوره — فرصة لاستعادته بعرض.',
      jsonb_build_object('customer_id', new.customer_id, 'entry_id', new.id));
  end if;

  return new;
end;
$function$;

revoke execute on function public.on_waitlist_status_change() from public, anon, authenticated;

-- ── ٤) مسار المسح يرقّي أيضًا — إنهاء التمييز ضدّ عملاء المسح ──
-- (تعديل موضعي: سطر tier في تحديث customer_restaurant داخل public_checkin)
create or replace function public.public_checkin(p_slug text, p_phone text, p_name text default null, p_branch_id uuid default null)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_norm text; v_rid uuid; v_rname text; v_rlogo text; v_branch uuid; v_cid uuid;
  v_last timestamptz; v_recent boolean; v_is_first boolean; v_visits integer; v_points integer;
  v_set public.checkin_settings%rowtype; v_loy public.loyalty_programs%rowtype;
  v_gift jsonb := null; v_loyrew jsonb := null; v_instant jsonb := null;
  v_gift_id uuid; v_instant_id uuid;
begin
  v_norm := public.norm_phone_input(p_phone);
  if length(v_norm) <> 9 then
    return jsonb_build_object('ok', false, 'error', 'invalid_phone');
  end if;

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

  if not public.check_rate('checkin:b:' || coalesce(v_branch::text,'-'), 120, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select * into v_set from public.checkin_settings where branch_id = v_branch;

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

    if v_set.branch_id is not null and v_set.instant_enabled then
      insert into public.customer_rewards
        (restaurant_id, customer_id, kind, title, value, value_kind, description, status, expires_at)
      values
        (v_rid, v_cid, v_set.instant_kind, v_set.instant_title, v_set.instant_value, v_set.instant_value_kind,
         'مكافأة فورية عند المسح', 'active', now() + (v_set.instant_expires_days || ' days')::interval)
      returning id into v_instant_id;
      v_instant := jsonb_build_object('id', v_instant_id, 'title', v_set.instant_title, 'kind', v_set.instant_kind,
        'value', v_set.instant_value, 'value_kind', v_set.instant_value_kind, 'expires_days', v_set.instant_expires_days);
    end if;

    if v_loy.restaurant_id is not null and coalesce(v_loy.reward_threshold,0) > 0
       and v_points >= v_loy.reward_threshold then
      insert into public.customer_rewards (restaurant_id, customer_id, kind, title, value_kind, description, status, expires_at)
      values (v_rid, v_cid, 'gift', coalesce(nullif(btrim(v_loy.reward_description),''), 'مكافأة الولاء'),
              'percent', 'مكافأة إتمام نقاط الولاء', 'active', now() + interval '30 days');
      v_points := v_points - v_loy.reward_threshold;
      v_loyrew := jsonb_build_object('title', coalesce(nullif(btrim(v_loy.reward_description),''), 'مكافأة الولاء'));
    end if;

    -- الترقية تعمل من المسح كما تعمل من الإجلاس — نفس الدالة، نفس الإعداد
    update public.customer_restaurant set visits = v_visits, points = v_points, last_visit = now(),
      tier = coalesce(public.tier_for_visits(v_rid, v_visits), tier),
      updated_at = now()
      where restaurant_id = v_rid and customer_id = v_cid;
  end if;

  if v_is_first and v_set.branch_id is not null and v_set.welcome_enabled then
    insert into public.customer_rewards
      (restaurant_id, customer_id, kind, title, value, value_kind, description, status, expires_at)
    values
      (v_rid, v_cid, v_set.welcome_kind, v_set.welcome_title, v_set.welcome_value, v_set.welcome_value_kind,
       'هدية ترحيب أول زيارة', 'active', now() + (v_set.welcome_expires_days || ' days')::interval)
    returning id into v_gift_id;
    v_gift := jsonb_build_object('id', v_gift_id, 'title', v_set.welcome_title, 'kind', v_set.welcome_kind,
      'value', v_set.welcome_value, 'value_kind', v_set.welcome_value_kind, 'expires_days', v_set.welcome_expires_days);
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
    'gift', v_gift, 'loyalty_reward', v_loyrew, 'instant', v_instant);
end;
$function$;

-- ── ٥) «وضعي» يعرض اسم الطبقة الذي اختاره المالك لا المفتاح التقني ──
create or replace function public.my_restaurant_status(p_slug text, p_phone text)
returns jsonb
language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_norm text; v_rid uuid; v_cid uuid; v_row record; v_loy record; v_name text;
  v_tier_name text; v_tier_perk text;
begin
  v_norm := public.norm_phone_input(p_phone);
  if length(v_norm) <> 9 then
    return jsonb_build_object('known', false);
  end if;
  if not public.check_rate('status:p:' || v_norm, 60, interval '1 hour') then
    return jsonb_build_object('known', false, 'error', 'rate_limited');
  end if;

  select r.id into v_rid from public.restaurants r
  where r.slug = p_slug and r.is_active limit 1;
  if v_rid is null then
    return jsonb_build_object('known', false);
  end if;

  select c.id, c.full_name into v_cid, v_name from public.customers c
  where right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 9) = v_norm
  order by c.created_at limit 1;
  if v_cid is null then
    return jsonb_build_object('known', false);
  end if;

  select visits, points, tier, last_visit into v_row
  from public.customer_restaurant
  where restaurant_id = v_rid and customer_id = v_cid;
  if v_row is null or coalesce(v_row.visits, 0) = 0 then
    return jsonb_build_object('known', false);
  end if;

  select points_per_visit, reward_threshold, reward_description into v_loy
  from public.loyalty_programs where restaurant_id = v_rid and is_active;

  if v_row.tier is not null then
    select elem->>'name', elem->>'perk' into v_tier_name, v_tier_perk
    from public.loyalty_programs lp,
         jsonb_array_elements(coalesce(lp.tier_config, '[]'::jsonb)) elem
    where lp.restaurant_id = v_rid and elem->>'key' = v_row.tier
    limit 1;
  end if;

  return jsonb_build_object(
    'known', true,
    'name', v_name,
    'visits', v_row.visits,
    'points', coalesce(v_row.points, 0),
    'tier', v_row.tier,
    'tier_name', v_tier_name,
    'tier_perk', nullif(btrim(coalesce(v_tier_perk, '')), ''),
    'last_visit', v_row.last_visit,
    'loyalty', case when v_loy is null then null else jsonb_build_object(
      'points_per_visit', v_loy.points_per_visit,
      'threshold', v_loy.reward_threshold,
      'reward', v_loy.reward_description) end,
    'rewards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cr.id, 'kind', cr.kind, 'title', cr.title, 'value', cr.value,
        'value_kind', cr.value_kind, 'code', cr.code, 'expires_at', cr.expires_at,
        'description', cr.description) order by cr.created_at desc)
      from public.customer_rewards cr
      where cr.restaurant_id = v_rid and cr.customer_id = v_cid
        and cr.status = 'active'
        and (cr.expires_at is null or cr.expires_at > now())
    ), '[]'::jsonb));
end $function$;
