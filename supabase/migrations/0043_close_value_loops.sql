-- إغلاق حلقات القيمة التي كانت «شكلًا بلا مفعول»:
--   ١) كل هدية تولد برمز قصير يُتحقّق منه عند الكاشير (كان لا يوجد أي إثبات).
--   ٢) دالّتا استقبال: بحث برقم/رمز + اعتماد الهدية — من شاشة الاستقبال.
--   ٣) استخدام العروض صار حقيقيًّا: claim_offer تكتب offer_redemptions وتصدر
--      هدية برمز (كان العدّاد صفرًا أبديًّا لأن لا مسار كتابة إطلاقًا).
--   ٤) نقاط الولاء لا تُحسب مرتين (دور + مسح لنفس الزيارة)، والإجلاس لا يُحسب
--      مرتين لو تقلّبت الحالة (visit_counted_at).
--   ٥) ترقية تلقائية للفئة: فضي عند ٥ زيارات، ذهبي عند ١٥.
--   ٦) قائمة ولاء العميل لا تُخفي المطعم لحظة صرف المكافأة (points=0)
--      وتُظهر الفئة والزيارات.
--   ٧) redeem_customer_reward (حرق ذاتي بلا استخدام) سُحبت صلاحيتها.

create or replace function public.gen_reward_code()
returns trigger language plpgsql set search_path to ''
as $function$
declare chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; out text;
begin
  if new.code is null or btrim(new.code) = '' then
    out := '';
    for i in 1..6 loop
      out := out || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    end loop;
    new.code := out;
  end if;
  return new;
end $function$;
drop trigger if exists trg_reward_code on public.customer_rewards;
create trigger trg_reward_code before insert on public.customer_rewards
  for each row execute function public.gen_reward_code();

update public.customer_rewards set code = null where code is not null and btrim(code) = '';
update public.customer_rewards cr set code = sub.c
from (select id, upper(substr(md5(id::text || clock_timestamp()::text), 1, 6)) as c
      from public.customer_rewards where code is null and status = 'active') sub
where cr.id = sub.id;

create or replace function public.staff_lookup_rewards(p_query text)
returns table(id uuid, customer_name text, customer_phone text, kind text, title text,
              value numeric, value_kind text, code text, expires_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path to ''
as $function$
declare v_norm text := public.norm_phone_input(p_query);
begin
  return query
  select cr.id, c.full_name, c.phone, cr.kind, cr.title, cr.value, cr.value_kind,
         cr.code, cr.expires_at, cr.created_at
  from public.customer_rewards cr
  join public.customers c on c.id = cr.customer_id
  where cr.status = 'active'
    and (cr.expires_at is null or cr.expires_at > now())
    and public.is_staff_of(cr.restaurant_id)
    and (
      (length(v_norm) = 9 and right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 9) = v_norm)
      or upper(btrim(p_query)) = cr.code
    )
  order by cr.created_at desc
  limit 20;
end $function$;
grant execute on function public.staff_lookup_rewards(text) to authenticated;
revoke execute on function public.staff_lookup_rewards(text) from anon, public;

create or replace function public.staff_redeem_reward(p_reward_id uuid)
returns boolean
language plpgsql security definer set search_path to ''
as $function$
declare n int;
begin
  update public.customer_rewards cr
     set status = 'redeemed', redeemed_at = now()
   where cr.id = p_reward_id
     and cr.status = 'active'
     and (cr.expires_at is null or cr.expires_at > now())
     and public.is_staff_of(cr.restaurant_id);
  get diagnostics n = row_count;
  return n > 0;
end $function$;
grant execute on function public.staff_redeem_reward(uuid) to authenticated;
revoke execute on function public.staff_redeem_reward(uuid) from anon, public;

create or replace function public.claim_offer(p_offer_id uuid, p_phone text, p_name text default null)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_norm text := public.norm_phone_input(p_phone);
  v_off public.offers%rowtype;
  v_cid uuid; v_used int; v_reward_id uuid; v_code text; v_visits int;
begin
  if length(v_norm) <> 9 then return jsonb_build_object('ok', false, 'error', 'invalid_phone'); end if;
  if not public.check_rate('claim:p:' || v_norm, 10, interval '1 day') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select * into v_off from public.offers where id = p_offer_id
    and is_active
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
    and audience in ('all','new','slow_hours');
  if v_off.id is null then return jsonb_build_object('ok', false, 'error', 'offer_unavailable'); end if;

  if v_off.total_limit is not null and coalesce(v_off.redeemed_count,0) >= v_off.total_limit then
    return jsonb_build_object('ok', false, 'error', 'sold_out');
  end if;

  select c.id into v_cid from public.customers c
  where right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 9) = v_norm
  order by c.created_at limit 1;
  if v_cid is null then
    insert into public.customers (full_name, phone)
    values (nullif(btrim(coalesce(p_name,'')), ''), '0' || v_norm) returning id into v_cid;
  end if;

  if v_off.audience = 'new' then
    select coalesce(visits, 0) into v_visits from public.customer_restaurant
     where restaurant_id = v_off.restaurant_id and customer_id = v_cid;
    if coalesce(v_visits, 0) > 0 then
      return jsonb_build_object('ok', false, 'error', 'new_customers_only');
    end if;
  end if;

  select count(*) into v_used from public.offer_redemptions
   where offer_id = v_off.id and customer_id = v_cid;
  if v_used >= coalesce(v_off.per_customer_limit, 1) then
    return jsonb_build_object('ok', false, 'error', 'already_claimed');
  end if;

  insert into public.offer_redemptions (offer_id, restaurant_id, customer_id, branch_id, amount)
  values (v_off.id, v_off.restaurant_id, v_cid, v_off.branch_id, v_off.value);
  update public.offers set redeemed_count = coalesce(redeemed_count,0) + 1, updated_at = now()
   where id = v_off.id;

  insert into public.customer_rewards
    (restaurant_id, customer_id, kind, title, value, value_kind, description, status, expires_at)
  values
    (v_off.restaurant_id, v_cid,
     case when v_off.kind = 'percent' then 'discount' else 'gift' end,
     v_off.title, v_off.value,
     case when v_off.kind = 'percent' then 'percent' else 'amount' end,
     'من عرض: ' || v_off.title, 'active', now() + interval '48 hours')
  returning id, code into v_reward_id, v_code;

  return jsonb_build_object('ok', true, 'reward_id', v_reward_id, 'code', v_code,
                            'title', v_off.title, 'expires_hours', 48);
end $function$;
grant execute on function public.claim_offer(uuid, text, text) to anon, authenticated;

alter table public.waitlist_entries add column if not exists visit_counted_at timestamptz;

-- الإجلاس لا يُحسب مرتين + لا يزدوج مع مسح حديث + ترقية الفئة
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
      tier = case
        when customer_restaurant.visits + 1 >= 15 then 'gold'
        when customer_restaurant.visits + 1 >= 5 and customer_restaurant.tier <> 'gold' then 'silver'
        else customer_restaurant.tier end,
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

-- المسح لا يزدوج مع إجلاس حديث (الاتجاه المعاكس) + ترقية الفئة + رمز الهدية في الردّ
create or replace function public.public_checkin(p_slug text, p_phone text, p_name text default null, p_branch_id uuid default null)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_norm text; v_rid uuid; v_rname text; v_rlogo text; v_branch uuid; v_cid uuid;
  v_last timestamptz; v_recent boolean; v_is_first boolean; v_visits integer; v_points integer;
  v_set public.checkin_settings%rowtype; v_loy public.loyalty_programs%rowtype;
  v_gift jsonb := null; v_loyrew jsonb := null; v_gift_id uuid; v_gift_code text; v_seated_recent boolean;
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

  -- «حديث» = مسح خلال ٤ ساعات أو إجلاس خلال ٤ ساعات (زيارة واحدة لا اثنتان)
  select exists (
    select 1 from public.waitlist_entries w
    join public.branches b on b.id = w.branch_id
    where b.restaurant_id = v_rid and w.customer_id = v_cid
      and w.visit_counted_at > now() - interval '4 hours'
  ) into v_seated_recent;
  v_recent := (v_last is not null and v_last > now() - interval '4 hours') or v_seated_recent;

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

    update public.customer_restaurant set visits = v_visits, points = v_points, last_visit = now(),
      tier = case when v_visits >= 15 then 'gold'
                  when v_visits >= 5 and tier <> 'gold' then 'silver'
                  else tier end,
      updated_at = now()
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
      returning id, code into v_gift_id, v_gift_code;
      v_gift := jsonb_build_object('id', v_gift_id, 'code', v_gift_code, 'title', v_set.welcome_title, 'kind', v_set.welcome_kind,
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

-- قائمة ولاء العميل: لا تختفي عند points=0 + تُظهر الفئة والزيارات
drop function if exists public.get_customer_loyalty(text);
create function public.get_customer_loyalty(p_phone text)
returns table(restaurant text, restaurant_slug text, points integer, reward_threshold integer,
              reward_description text, visits integer, tier text)
language plpgsql security definer set search_path to ''
as $function$
begin
  if length(public.norm_phone_input(p_phone)) <> 9 then return; end if;
  if not public.check_rate('loyalty:p:' || public.norm_phone_input(p_phone), 60, interval '1 hour') then return; end if;
  return query
  select r.name, r.slug, cr.points, lp.reward_threshold, lp.reward_description, cr.visits, cr.tier
  from public.customer_restaurant cr
  join public.customers c on c.id = cr.customer_id
  join public.restaurants r on r.id = cr.restaurant_id
  join public.loyalty_programs lp on lp.restaurant_id = cr.restaurant_id and lp.is_active
  where right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 9) = public.norm_phone_input(p_phone)
    and (cr.points > 0 or cr.visits > 0)
  order by cr.points desc;
end $function$;
grant execute on function public.get_customer_loyalty(text) to anon, authenticated;

-- الحرق الذاتي بلا تحقّق يُقفل (الاعتماد عند الكاشير عبر staff_redeem_reward)
revoke execute on function public.redeem_customer_reward(uuid, text) from public, anon, authenticated;
