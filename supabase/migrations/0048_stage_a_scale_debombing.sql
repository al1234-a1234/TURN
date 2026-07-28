-- المرحلة أ — نزع قنابل التوسّع (يوم ٦ من خطة الإطلاق).
--
-- ١) rate_limits إلى UNLOGGED: كل مسح واستعلام رقم يكتب صفًّا هنا، أي أن
--    جهاز الحماية نفسه كان مرشّحًا ليكون أثقل حمل كتابة في النظام وقت
--    الذروة (WAL لكل upsert). بياناته زائلة بطبعها — فقدانها عند إقلاع
--    نادر يعني فقط أن العدّادات تبدأ من الصفر، وهذا مقبول تمامًا مقابل
--    كتابة أرخص بكثير وبلا تضخيم WAL.
--
-- ٢) سقف مسح الفرع يصير قابلًا للضبط: الثابت ١٢٠/ساعة يلمسه مطعم واحد
--    كبير (٥٠٠+ عميل/يوم وذروة عشاء مركّزة) فيُرفض عميل شرعي. السقف
--    ينتقل إلى checkin_settings لكل فرع، والافتراضي يبقى كما هو.

-- ── ١) جهاز الحماية لا يكتب WAL ──
alter table public.rate_limits set unlogged;

-- ── ٢) سقف الفرع للمالك ──
alter table public.checkin_settings
  add column if not exists scan_hourly_limit integer not null default 120;

alter table public.checkin_settings
  drop constraint if exists checkin_settings_scan_hourly_limit_check;
alter table public.checkin_settings
  add constraint checkin_settings_scan_hourly_limit_check
  check (scan_hourly_limit >= 10 and scan_hourly_limit <= 5000);

comment on column public.checkin_settings.scan_hourly_limit is
  'أقصى مسحات/ساعة للفرع — درع ضد الإغراق الجماعي، يُرفع للفروع الكبيرة';

-- ── ٣) public_checkin تقرأ سقف فرعها ──
-- (التغيير الجوهري: قراءة الإعدادات قُدِّمت قبل فحص حدّ الفرع، والحدّ
--  الثابت 120 صار coalesce(v_set.scan_hourly_limit, 120))
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

  -- الإعدادات تُقرأ قبل فحص حدّ الفرع: السقف صار منها
  select * into v_set from public.checkin_settings where branch_id = v_branch;

  if not public.check_rate('checkin:b:' || coalesce(v_branch::text,'-'),
                           coalesce(v_set.scan_hourly_limit, 120), interval '1 hour') then
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
