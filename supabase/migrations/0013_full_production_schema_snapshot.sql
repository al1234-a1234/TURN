-- ============================================================================
--  لقطة مخطط الإنتاج الكاملة (Full production schema snapshot)
--  مُولّدة حرفيًّا من قاعدة الإنتاج الحيّة (Supabase ref: nkdfxmjuigslmangzuua).
--  الغرض: إنقاذ المخطط — يجعل المستودع قادرًا على إعادة بناء الإنتاج كاملًا.
--  آمنة للتكرار (idempotent): تعمل على قاعدة جديدة أو فوق المايجريشنات الحالية.
--  تشمل: 6 أنواع enum · 25 جدولًا · كل القيود والفهارس · 34 دالة · 15 trigger ·
--         تفعيل RLS + كل السياسات · محفّز الأحداث ensure_rls.
--  ملاحظة: هذا إعادة بناء أمينة من الكتالوج (مب ناتج `supabase db pull` الحرفي).
--  ملاحظة: الـ Edge Function «provision-owner» تُدار على Supabase وليست ضمن هذا الملف.
-- ============================================================================

-- ---------- الإضافات (Extensions) ----------
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- ---------- الأنواع (Enums) ----------
do $$ begin create type public.notification_channel as enum ('sms', 'whatsapp', 'push', 'email'); exception when duplicate_object then null; end $$;
do $$ begin create type public.offer_kind as enum ('percent', 'fixed', 'free_item', 'bogo', 'points'); exception when duplicate_object then null; end $$;
do $$ begin create type public.reservation_status as enum ('pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show'); exception when duplicate_object then null; end $$;
do $$ begin create type public.table_status as enum ('available', 'occupied', 'reserved', 'inactive'); exception when duplicate_object then null; end $$;
do $$ begin create type public.user_role as enum ('owner', 'manager', 'staff', 'host'); exception when duplicate_object then null; end $$;
do $$ begin create type public.waitlist_status as enum ('waiting', 'notified', 'seated', 'cancelled', 'no_show', 'expired'); exception when duplicate_object then null; end $$;

-- ---------- الجداول (Tables) ----------
create table if not exists public.branch_settings (
  branch_id uuid not null,
  accepts_reservations boolean not null default true,
  accepts_waitlist boolean not null default true,
  max_party_size integer not null default 20,
  default_duration_min integer not null default 90,
  charge_customer boolean not null default false,
  grace_period_min integer not null default 15,
  opening_hours jsonb default '{}'::jsonb,
  booking_window_days integer not null default 30,
  notification_channels notification_channel[] default ARRAY['sms'::notification_channel],
  custom jsonb default '{}'::jsonb,
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.branches (
  id uuid not null default uuid_generate_v4(),
  restaurant_id uuid not null,
  name text not null,
  name_en text,
  address text,
  city text,
  lat double precision,
  lng double precision,
  phone text,
  timezone text not null default 'Asia/Riyadh'::text,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.checkin_settings (
  restaurant_id uuid not null,
  welcome_enabled boolean not null default true,
  welcome_kind text not null default 'gift'::text,
  welcome_title text not null default 'هدية ترحيب'::text,
  welcome_value numeric,
  welcome_value_kind text not null default 'percent'::text,
  welcome_expires_days integer not null default 14,
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.checkins (
  id uuid not null default gen_random_uuid(),
  restaurant_id uuid not null,
  branch_id uuid,
  customer_id uuid not null,
  source text not null default 'qr'::text,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.customer_restaurant (
  restaurant_id uuid not null,
  customer_id uuid not null,
  visits integer not null default 0,
  no_shows integer not null default 0,
  points integer not null default 0,
  tier text not null default 'regular'::text,
  is_vip boolean not null default false,
  is_blocked boolean not null default false,
  tags text[] not null default '{}'::text[],
  note text,
  first_seen timestamp with time zone not null default now(),
  last_visit timestamp with time zone,
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.customer_rewards (
  id uuid not null default gen_random_uuid(),
  restaurant_id uuid not null,
  customer_id uuid not null,
  kind text not null default 'gift'::text,
  title text not null,
  value numeric,
  value_kind text not null default 'percent'::text,
  description text,
  code text,
  status text not null default 'active'::text,
  created_by uuid,
  created_at timestamp with time zone not null default now(),
  expires_at timestamp with time zone,
  redeemed_at timestamp with time zone
);

create table if not exists public.customers (
  id uuid not null default uuid_generate_v4(),
  user_id uuid,
  full_name text not null,
  phone text not null,
  email text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.daily_stats (
  branch_id uuid not null,
  stat_date date not null,
  joined_count integer not null default 0,
  seated_count integer not null default 0,
  cancelled_count integer not null default 0,
  no_show_count integer not null default 0,
  inside_count integer not null default 0,
  outside_count integer not null default 0,
  avg_wait_seconds integer not null default 0,
  peak_hour smallint,
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.feature_modules (
  key text not null,
  name_ar text not null,
  description_ar text,
  category text not null default 'add_on'::text,
  is_core boolean not null default false,
  default_enabled boolean not null default false,
  sort_order integer not null default 100,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.loyalty_programs (
  restaurant_id uuid not null,
  is_active boolean not null default false,
  points_per_visit integer not null default 1,
  reward_threshold integer not null default 10,
  reward_description text,
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.menu_categories (
  id uuid not null default uuid_generate_v4(),
  restaurant_id uuid not null,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.menu_items (
  id uuid not null default uuid_generate_v4(),
  restaurant_id uuid not null,
  category_id uuid not null,
  name text not null,
  description text,
  price numeric(10,2),
  image_url text,
  is_available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.notifications (
  id uuid not null default uuid_generate_v4(),
  branch_id uuid not null,
  customer_id uuid,
  channel notification_channel not null,
  template text not null,
  payload jsonb,
  sent_at timestamp with time zone,
  delivered boolean default false,
  error text,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.offer_redemptions (
  id uuid not null default gen_random_uuid(),
  offer_id uuid not null,
  restaurant_id uuid not null,
  customer_id uuid,
  branch_id uuid,
  amount numeric(10,2),
  redeemed_at timestamp with time zone not null default now()
);

create table if not exists public.offers (
  id uuid not null default gen_random_uuid(),
  restaurant_id uuid not null,
  title text not null,
  description text,
  kind offer_kind not null,
  value numeric(10,2),
  code text,
  audience text not null default 'all'::text,
  conditions jsonb not null default '{}'::jsonb,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  total_limit integer,
  per_customer_limit integer not null default 1,
  redeemed_count integer not null default 0,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.owner_insights (
  id uuid not null default gen_random_uuid(),
  restaurant_id uuid not null,
  kind text not null,
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.platform_admins (
  user_id uuid not null,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.reservations (
  id uuid not null default uuid_generate_v4(),
  branch_id uuid not null,
  customer_id uuid not null,
  table_id uuid,
  party_size integer not null,
  reserved_at timestamp with time zone not null,
  duration_min integer not null default 90,
  status reservation_status not null default 'pending'::reservation_status,
  notes text,
  time_range tstzrange,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.restaurant_features (
  restaurant_id uuid not null,
  module_key text not null,
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  enabled_at timestamp with time zone,
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.restaurant_photos (
  id uuid not null default gen_random_uuid(),
  restaurant_id uuid not null,
  url text not null,
  caption text,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.restaurants (
  id uuid not null default uuid_generate_v4(),
  owner_id uuid not null,
  name text not null,
  name_en text,
  slug text not null,
  logo_url text,
  phone text,
  email text,
  description text,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  cover_url text,
  claim_code text,
  claimed_at timestamp with time zone,
  owner_username text,
  owner_phone text,
  links jsonb not null default '{}'::jsonb,
  cuisine text,
  cuisine_en text
);

create table if not exists public.reviews (
  id uuid not null default gen_random_uuid(),
  restaurant_id uuid not null,
  branch_id uuid,
  customer_id uuid,
  waitlist_entry_id uuid,
  rating smallint not null,
  comment text,
  routed_to_google boolean not null default false,
  is_published boolean not null default true,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.staff (
  id uuid not null default uuid_generate_v4(),
  user_id uuid not null,
  restaurant_id uuid not null,
  branch_id uuid,
  role user_role not null default 'staff'::user_role,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  permissions jsonb not null default '{}'::jsonb,
  name text
);

create table if not exists public.tables (
  id uuid not null default uuid_generate_v4(),
  branch_id uuid not null,
  label text not null,
  seats integer not null,
  min_seats integer,
  status table_status not null default 'available'::table_status,
  zone text,
  sort_order integer default 0,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.waitlist_entries (
  id uuid not null default uuid_generate_v4(),
  branch_id uuid not null,
  customer_id uuid not null,
  party_size integer not null,
  status waitlist_status not null default 'waiting'::waitlist_status,
  "position" integer,
  quoted_wait_min integer,
  joined_at timestamp with time zone not null default now(),
  notified_at timestamp with time zone,
  seated_at timestamp with time zone,
  table_id uuid,
  notes text,
  updated_at timestamp with time zone not null default now(),
  zone text not null default 'any'::text
);

-- ---------- الدوال (Functions) ----------
CREATE OR REPLACE FUNCTION public.active_waitlist_counts()
 RETURNS TABLE(branch_id uuid, total bigint, inside bigint, outside bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    w.branch_id,
    count(*),
    count(*) FILTER (WHERE w.zone = 'inside'),
    count(*) FILTER (WHERE w.zone = 'outside')
  FROM public.waitlist_entries w
  WHERE w.status IN ('waiting', 'notified')
  GROUP BY w.branch_id;
$function$;

CREATE OR REPLACE FUNCTION public.admin_create_restaurant(p_name text, p_slug text, p_branch_name text DEFAULT 'الفرع الرئيسي'::text, p_name_en text DEFAULT NULL::text, p_owner_email text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_address text DEFAULT NULL::text)
 RETURNS TABLE(slug text, claim_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    v_uid uuid := auth.uid();
    v_rest_id uuid;
    v_code text;
    v_owner uuid;
begin
    if not public.is_platform_admin() then
        raise exception 'غير مصرّح — الأدمِن فقط' using errcode = '42501';
    end if;

    v_code := public.gen_claim_code();

    if p_owner_email is not null and length(trim(p_owner_email)) > 0 then
        select id into v_owner from auth.users
         where lower(email) = lower(trim(p_owner_email))
         limit 1;
    end if;

    insert into public.restaurants (owner_id, name, name_en, slug, email, claim_code, claimed_at)
        values (
            coalesce(v_owner, v_uid),
            p_name, p_name_en, p_slug,
            nullif(trim(p_owner_email), ''),
            case when v_owner is null then v_code else null end,
            case when v_owner is null then null else now() end
        )
        returning id into v_rest_id;

    insert into public.staff (user_id, restaurant_id, role)
        values (coalesce(v_owner, v_uid), v_rest_id, 'owner')
        on conflict (user_id, restaurant_id) do nothing;

    insert into public.branches (restaurant_id, name, city, address)
        values (v_rest_id, p_branch_name, p_city, p_address);

    return query select p_slug, case when v_owner is null then v_code else null end;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_waitlist_guest(p_entry_id uuid, p_phone text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    v_phone text := trim(p_phone);
    v_ok boolean := false;
begin
    update public.waitlist_entries w
       set status = 'cancelled', updated_at = now()
      from public.customers c
     where w.id = p_entry_id
       and c.id = w.customer_id
       and c.phone = v_phone
       and w.status in ('waiting', 'notified');
    get diagnostics v_ok = row_count;
    return v_ok;
end;
$function$;

CREATE OR REPLACE FUNCTION public.claim_restaurant(p_code text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    v_uid uuid := auth.uid();
    v_rest public.restaurants%rowtype;
begin
    if v_uid is null then
        raise exception 'يجب تسجيل الدخول' using errcode = '28000';
    end if;

    select * into v_rest from public.restaurants
     where claim_code = upper(trim(p_code))
     limit 1;

    if v_rest.id is null then
        raise exception 'رمز غير صحيح أو مُستخدَم مسبقًا' using errcode = 'P0002';
    end if;

    update public.restaurants
       set owner_id = v_uid, claim_code = null, claimed_at = now()
     where id = v_rest.id;

    insert into public.staff (user_id, restaurant_id, role)
        values (v_uid, v_rest.id, 'owner')
        on conflict (user_id, restaurant_id) do nothing;

    return v_rest.slug;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_default_branch_settings()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
    insert into public.branch_settings (branch_id)
    values (new.id)
    on conflict (branch_id) do nothing;
    return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_reservation_guest(p_branch_id uuid, p_full_name text, p_phone text, p_reserved_at timestamp with time zone, p_party_size integer, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rid uuid;
  v_customer uuid;
  v_res uuid;
BEGIN
  v_rid := public.restaurant_of_branch(p_branch_id);
  IF NOT (public.is_staff_of(v_rid) OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT id INTO v_customer FROM public.customers WHERE phone = p_phone LIMIT 1;
  IF v_customer IS NULL THEN
    INSERT INTO public.customers (full_name, phone)
    VALUES (COALESCE(NULLIF(trim(p_full_name), ''), 'ضيف'), p_phone)
    RETURNING id INTO v_customer;
  END IF;

  INSERT INTO public.reservations (branch_id, customer_id, reserved_at, party_size, notes, status)
  VALUES (p_branch_id, v_customer, p_reserved_at, GREATEST(COALESCE(p_party_size, 2), 1), NULLIF(trim(p_notes), ''), 'confirmed')
  RETURNING id INTO v_res;

  RETURN v_res;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_restaurant_with_branch(p_name text, p_slug text, p_branch_name text, p_name_en text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_address text DEFAULT NULL::text, p_timezone text DEFAULT 'Asia/Riyadh'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    v_uid uuid := auth.uid();
    v_rest_id uuid;
begin
    if v_uid is null then
        raise exception 'يجب تسجيل الدخول' using errcode = '28000';
    end if;

    insert into public.restaurants (owner_id, name, name_en, slug, phone)
        values (v_uid, p_name, p_name_en, p_slug, p_phone)
        returning id into v_rest_id;

    insert into public.staff (user_id, restaurant_id, role)
        values (v_uid, v_rest_id, 'owner')
        on conflict (user_id, restaurant_id) do nothing;

    insert into public.branches (restaurant_id, name, city, address, timezone)
        values (v_rest_id, p_branch_name, p_city, p_address, p_timezone);

    return p_slug;
end;
$function$;

CREATE OR REPLACE FUNCTION public.demo_live_activity()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_ids uuid[];
begin
  select array_agg(id) into v_ids from public.customers where phone like '0552%';
  if v_ids is null then return; end if;

  insert into public.reservations (branch_id, customer_id, party_size, reserved_at, status)
  select b.id,
         v_ids[1 + floor(random()*array_length(v_ids,1))::int],
         2 + floor(random()*6)::int,
         date_trunc('hour', now()) + (floor(random()*14) || ' days')::interval + ((13 + floor(random()*10)) || ' hours')::interval,
         (case when random() < 0.5 then 'confirmed' else 'pending' end)::public.reservation_status
  from (
    select b2.id from public.branches b2 join public.restaurants r on r.id = b2.restaurant_id
    where r.slug in ('prime-cut','takya','najd-village','eficto','bait-almounah','noo','rudy')
    order by random() limit 3
  ) b;

  insert into public.waitlist_entries (branch_id, customer_id, party_size, zone, status, joined_at)
  select b.id,
         v_ids[1 + floor(random()*array_length(v_ids,1))::int],
         1 + floor(random()*5)::int,
         case when random() < 0.6 then 'inside' else 'outside' end,
         'waiting'::public.waitlist_status,
         now()
  from (
    select b2.id from public.branches b2 join public.restaurants r on r.id = b2.restaurant_id
    where r.slug in ('prime-cut','takya','najd-village','eficto','bait-almounah','noo','rudy')
    order by random() limit 2
  ) b;
end $function$;

CREATE OR REPLACE FUNCTION public.gen_claim_code()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
    alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    code text := '';
    i int;
begin
    loop
        code := '';
        for i in 1..8 loop
            code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
        end loop;
        exit when not exists (select 1 from public.restaurants where claim_code = code);
    end loop;
    return code;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_customer_loyalty(p_phone text)
 RETURNS TABLE(restaurant text, restaurant_slug text, points integer, reward_threshold integer, reward_description text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select r.name, r.slug, cr.points, lp.reward_threshold, lp.reward_description
  from public.customer_restaurant cr
  join public.customers c on c.id = cr.customer_id
  join public.restaurants r on r.id = cr.restaurant_id
  join public.loyalty_programs lp on lp.restaurant_id = cr.restaurant_id and lp.is_active
  where c.phone = trim(p_phone) and cr.points > 0
  order by cr.points desc;
$function$;

CREATE OR REPLACE FUNCTION public.get_customer_rewards(p_phone text)
 RETURNS TABLE(id uuid, restaurant text, restaurant_slug text, kind text, title text, value numeric, value_kind text, description text, code text, status text, expires_at timestamp with time zone, created_at timestamp with time zone, redeemed_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select cr.id, r.name, r.slug, cr.kind, cr.title, cr.value, cr.value_kind,
         cr.description, cr.code, cr.status, cr.expires_at, cr.created_at, cr.redeemed_at
  from public.customer_rewards cr
  join public.customers c on c.id = cr.customer_id
  join public.restaurants r on r.id = cr.restaurant_id
  where c.phone = trim(p_phone)
    and cr.status in ('active','redeemed')
    and (cr.status = 'redeemed' or cr.expires_at is null or cr.expires_at > now())
  order by (cr.status = 'active') desc, cr.created_at desc;
$function$;

CREATE OR REPLACE FUNCTION public.grant_reward_to_segment(p_restaurant_id uuid, p_segment text, p_kind text, p_title text, p_value numeric, p_value_kind text, p_description text, p_code text, p_expires_at timestamp with time zone)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n integer;
begin
  if not (public.staff_has_perm(p_restaurant_id, 'customers') or public.is_platform_admin()) then
    return 0;
  end if;
  if coalesce(trim(p_title),'') = '' then return 0; end if;

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
        end;
  get diagnostics n = row_count;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.has_feature(rest_id uuid, p_module text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT rf.enabled FROM public.restaurant_features rf
      WHERE rf.restaurant_id = rest_id AND rf.module_key = p_module),
    (SELECT fm.is_core OR fm.default_enabled FROM public.feature_modules fm
      WHERE fm.key = p_module),
    false
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_manager_of(rest_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
    select exists (
        select 1 from public.staff
        where staff.user_id = auth.uid()
          and staff.restaurant_id = rest_id
          and staff.role in ('owner','manager')
          and staff.is_active = true
    );
$function$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
    select exists (
        select 1 from public.platform_admins
        where user_id = auth.uid()
    );
$function$;

CREATE OR REPLACE FUNCTION public.is_staff_of(rest_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
    select exists (
        select 1 from public.staff
        where staff.user_id = auth.uid()
          and staff.restaurant_id = rest_id
          and staff.is_active = true
    );
$function$;

CREATE OR REPLACE FUNCTION public.join_waitlist_guest(p_branch_id uuid, p_full_name text, p_phone text, p_party_size integer DEFAULT 1, p_zone text DEFAULT 'inside'::text)
 RETURNS TABLE(queue_pos integer, entry_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    v_name text := trim(p_full_name);
    v_phone text := trim(p_phone);
    v_party int := greatest(coalesce(p_party_size, 1), 1);
    v_zone text := case when p_zone in ('inside','outside') then p_zone else 'inside' end;
    v_branch_active boolean;
    v_accepts boolean;
    v_cust_id uuid;
    v_pos int;
    v_eid uuid;
begin
    if v_name = '' or v_phone = '' then
        raise exception 'الاسم والرقم مطلوبان' using errcode = '22023';
    end if;

    select is_active into v_branch_active from public.branches where id = p_branch_id;
    if v_branch_active is distinct from true then
        raise exception 'الفرع غير متاح' using errcode = 'P0002';
    end if;

    select accepts_waitlist into v_accepts from public.branch_settings where branch_id = p_branch_id;
    if v_accepts is false then
        raise exception 'هذا الفرع لا يستقبل قائمة انتظار حاليًا' using errcode = 'P0001';
    end if;

    select w.position, w.id into v_pos, v_eid
      from public.waitlist_entries w
      join public.customers c on c.id = w.customer_id
     where w.branch_id = p_branch_id
       and c.phone = v_phone
       and w.status in ('waiting', 'notified')
     order by w.joined_at desc
     limit 1;
    if v_eid is not null then
        queue_pos := v_pos; entry_id := v_eid; return next; return;
    end if;

    select id into v_cust_id from public.customers where phone = v_phone and user_id is null limit 1;
    if v_cust_id is null then
        insert into public.customers (full_name, phone) values (v_name, v_phone) returning id into v_cust_id;
    else
        update public.customers set full_name = v_name where id = v_cust_id;
    end if;

    insert into public.waitlist_entries (branch_id, customer_id, party_size, zone)
         values (p_branch_id, v_cust_id, v_party, v_zone)
      returning waitlist_entries.position, id into v_pos, v_eid;

    queue_pos := v_pos; entry_id := v_eid; return next;
end;
$function$;

CREATE OR REPLACE FUNCTION public.on_waitlist_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rid uuid;
  pts int := 0;
  cust_name text;
  v_threshold int;
  v_reward_desc text;
  v_points int;
begin
  if new.customer_id is null then return new; end if;
  rid := public.restaurant_of_branch(new.branch_id);

  if new.status = 'seated' and old.status is distinct from 'seated' then
    select coalesce(points_per_visit,0), reward_threshold, reward_description
      into pts, v_threshold, v_reward_desc
      from public.loyalty_programs where restaurant_id = rid and is_active;
    pts := coalesce(pts, 0);
    insert into public.customer_restaurant (restaurant_id, customer_id, visits, points, last_visit, first_seen)
    values (rid, new.customer_id, 1, pts, coalesce(new.seated_at, now()), now())
    on conflict (restaurant_id, customer_id) do update set
      visits = customer_restaurant.visits + 1,
      points = customer_restaurant.points + pts,
      last_visit = greatest(customer_restaurant.last_visit, excluded.last_visit),
      updated_at = now();

    if v_threshold is not null and v_threshold > 0 then
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

CREATE OR REPLACE FUNCTION public.public_checkin(p_slug text, p_phone text, p_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_norm text; v_rid uuid; v_rname text; v_rlogo text; v_branch uuid; v_cid uuid;
  v_last timestamptz; v_recent boolean; v_is_first boolean; v_visits integer; v_points integer;
  v_set public.checkin_settings%rowtype; v_loy public.loyalty_programs%rowtype;
  v_gift jsonb := null; v_loyrew jsonb := null; v_gift_id uuid;
begin
  v_norm := right(regexp_replace(coalesce(p_phone,''), '\D', '', 'g'), 9);
  if length(v_norm) <> 9 then
    return jsonb_build_object('ok', false, 'error', 'invalid_phone');
  end if;

  select r.id, r.name, r.logo_url into v_rid, v_rname, v_rlogo
  from public.restaurants r where r.slug = p_slug and r.is_active limit 1;
  if v_rid is null then
    return jsonb_build_object('ok', false, 'error', 'restaurant_not_found');
  end if;

  select b.id into v_branch from public.branches b
  where b.restaurant_id = v_rid and b.is_active order by b.created_at limit 1;

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
    select * into v_set from public.checkin_settings where restaurant_id = v_rid;
    if v_set.restaurant_id is not null and v_set.welcome_enabled then
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

CREATE OR REPLACE FUNCTION public.redeem_customer_reward(p_reward_id uuid, p_phone text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n int;
begin
  update public.customer_rewards cr
     set status = 'redeemed', redeemed_at = now()
    from public.customers c
   where cr.id = p_reward_id
     and c.id = cr.customer_id
     and c.phone = trim(p_phone)
     and cr.status = 'active'
     and (cr.expires_at is null or cr.expires_at > now());
  get diagnostics n = row_count;
  return n > 0;
end $function$;

CREATE OR REPLACE FUNCTION public.restaurant_of_branch(b_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
    select restaurant_id from public.branches where id = b_id;
$function$;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rollup_all_daily_stats(p_date date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN SELECT id FROM public.branches WHERE is_active LOOP
    PERFORM public.rollup_daily_stats(r.id, p_date);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rollup_daily_stats(p_branch_id uuid, p_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  d_start timestamptz := p_date::timestamptz;
  d_end   timestamptz := (p_date + 1)::timestamptz;
BEGIN
  INSERT INTO public.daily_stats AS ds (
    branch_id, stat_date, joined_count, seated_count, cancelled_count,
    no_show_count, inside_count, outside_count, avg_wait_seconds, peak_hour, updated_at
  )
  SELECT
    p_branch_id,
    p_date,
    count(*) FILTER (WHERE joined_at >= d_start AND joined_at < d_end),
    count(*) FILTER (WHERE status = 'seated' AND seated_at >= d_start AND seated_at < d_end),
    count(*) FILTER (WHERE status = 'cancelled' AND joined_at >= d_start AND joined_at < d_end),
    count(*) FILTER (WHERE status = 'no_show' AND joined_at >= d_start AND joined_at < d_end),
    count(*) FILTER (WHERE zone = 'inside'  AND joined_at >= d_start AND joined_at < d_end),
    count(*) FILTER (WHERE zone = 'outside' AND joined_at >= d_start AND joined_at < d_end),
    COALESCE(round(avg(EXTRACT(EPOCH FROM (seated_at - joined_at)))
      FILTER (WHERE status = 'seated' AND seated_at IS NOT NULL AND seated_at >= d_start AND seated_at < d_end))::int, 0),
    (SELECT EXTRACT(HOUR FROM joined_at)::smallint
       FROM public.waitlist_entries w2
      WHERE w2.branch_id = p_branch_id AND w2.joined_at >= d_start AND w2.joined_at < d_end
      GROUP BY EXTRACT(HOUR FROM joined_at)
      ORDER BY count(*) DESC LIMIT 1),
    now()
  FROM public.waitlist_entries w
  WHERE w.branch_id = p_branch_id
    AND (w.joined_at >= d_start AND w.joined_at < d_end
         OR (w.seated_at >= d_start AND w.seated_at < d_end))
  ON CONFLICT (branch_id, stat_date) DO UPDATE SET
    joined_count     = EXCLUDED.joined_count,
    seated_count     = EXCLUDED.seated_count,
    cancelled_count  = EXCLUDED.cancelled_count,
    no_show_count    = EXCLUDED.no_show_count,
    inside_count     = EXCLUDED.inside_count,
    outside_count    = EXCLUDED.outside_count,
    avg_wait_seconds = EXCLUDED.avg_wait_seconds,
    peak_hour        = EXCLUDED.peak_hour,
    updated_at       = now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.run_daily_digest()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record; n int := 0;
  d_start timestamptz := (current_date - 1)::timestamptz;
  d_end   timestamptz := current_date::timestamptz;
  served int; joined int; cancelled int;
BEGIN
  FOR r IN SELECT id FROM public.restaurants WHERE is_active LOOP
    SELECT
      count(*) FILTER (WHERE w.status='seated' AND w.seated_at >= d_start AND w.seated_at < d_end),
      count(*) FILTER (WHERE w.joined_at >= d_start AND w.joined_at < d_end),
      count(*) FILTER (WHERE w.status='cancelled' AND w.joined_at >= d_start AND w.joined_at < d_end)
    INTO served, joined, cancelled
    FROM public.waitlist_entries w
    JOIN public.branches b ON b.id = w.branch_id
    WHERE b.restaurant_id = r.id;

    IF COALESCE(joined,0) = 0 THEN CONTINUE; END IF;

    INSERT INTO public.owner_insights (restaurant_id, kind, title, body, data)
    VALUES (
      r.id, 'daily_digest', 'ملخّص أمس',
      'خدمت ' || served || ' طاولة، انضم ' || joined || ' للطابور، وغادر ' || cancelled || '.',
      jsonb_build_object('served', served, 'joined', joined, 'cancelled', cancelled, 'date', (current_date - 1))
    );
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.run_slow_hours()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record; active_q int; changed int; total int := 0;
BEGIN
  FOR r IN
    SELECT rid FROM (
      SELECT DISTINCT public.restaurant_of_branch(b.id) AS rid FROM public.branches b WHERE b.is_active
    ) x WHERE public.has_feature(x.rid, 'slow_hours')
  LOOP
    SELECT count(*) INTO active_q
    FROM public.waitlist_entries w JOIN public.branches b ON b.id=w.branch_id
    WHERE b.restaurant_id = r.rid AND w.status IN ('waiting','notified');

    IF COALESCE(active_q,0) = 0 THEN
      UPDATE public.offers SET is_active = true, updated_at = now()
      WHERE restaurant_id = r.rid AND audience = 'slow_hours' AND is_active = false;
      GET DIAGNOSTICS changed = ROW_COUNT;
      IF changed > 0 THEN
        INSERT INTO public.owner_insights (restaurant_id, kind, title, body, data)
        VALUES (r.rid, 'slow_hours', 'فعّلنا عروض الركود',
                'الطابور هادئ الآن — فعّلنا ' || changed || ' عرض ركود لجذب العملاء.',
                jsonb_build_object('activated', changed));
        total := total + 1;
      END IF;
    ELSE
      UPDATE public.offers SET is_active = false, updated_at = now()
      WHERE restaurant_id = r.rid AND audience = 'slow_hours' AND is_active = true;
    END IF;
  END LOOP;
  RETURN total;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_reservation_time_range()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
    new.time_range := tstzrange(
        new.reserved_at,
        new.reserved_at + make_interval(mins => new.duration_min)
    );
    return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_staff_permission(p_staff_id uuid, p_perm text, p_granted boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE rid uuid;
BEGIN
  SELECT restaurant_id INTO rid FROM public.staff WHERE id = p_staff_id;
  IF rid IS NULL THEN RETURN; END IF;
  IF NOT (public.is_manager_of(rid) OR public.is_platform_admin()) THEN
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

CREATE OR REPLACE FUNCTION public.set_waitlist_position()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
    if new.position is null then
        select coalesce(max(w.position), 0) + 1
          into new.position
          from public.waitlist_entries w
         where w.branch_id = new.branch_id
           and w.status in ('waiting', 'notified');
    end if;
    return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.staff_can_read_customer(cust_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
    select exists (
        select 1 from public.reservations r
        where r.customer_id = cust_id
          and public.is_staff_of(public.restaurant_of_branch(r.branch_id))
    )
    or exists (
        select 1 from public.waitlist_entries w
        where w.customer_id = cust_id
          and public.is_staff_of(public.restaurant_of_branch(w.branch_id))
    );
$function$;

CREATE OR REPLACE FUNCTION public.staff_has_perm(rest_id uuid, p_perm text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.is_manager_of(rest_id)
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.restaurant_id = rest_id
        AND s.user_id = (select auth.uid())
        AND s.is_active
        AND COALESCE((s.permissions ->> p_perm)::boolean, false)
    );
$function$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.waitlist_counts(b_id uuid)
 RETURNS TABLE(total integer, inside integer, outside integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
    select
        count(*)::int,
        count(*) filter (where zone = 'inside')::int,
        count(*) filter (where zone = 'outside')::int
    from public.waitlist_entries
    where branch_id = b_id
      and status in ('waiting', 'notified');
$function$;

CREATE OR REPLACE FUNCTION public.waitlist_counts_for(p_branch_ids uuid[])
 RETURNS TABLE(branch_id uuid, total bigint, inside bigint, outside bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select w.branch_id,
         count(*),
         count(*) filter (where w.zone = 'inside'),
         count(*) filter (where w.zone = 'outside')
  from public.waitlist_entries w
  where w.status in ('waiting','notified')
    and w.branch_id = any(p_branch_ids)
  group by w.branch_id;
$function$;

-- ---------- القيود (Constraints: PK / UNIQUE / CHECK / FK / EXCLUDE) ----------
do $$ begin alter table public.branch_settings add constraint branch_settings_pkey PRIMARY KEY (branch_id); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.branches add constraint branches_pkey PRIMARY KEY (id); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.checkin_settings add constraint checkin_settings_pkey PRIMARY KEY (restaurant_id); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.checkins add constraint checkins_pkey PRIMARY KEY (id); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.customer_restaurant add constraint customer_restaurant_pkey PRIMARY KEY (restaurant_id, customer_id); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.customer_rewards add constraint customer_rewards_pkey PRIMARY KEY (id); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.customers add constraint customers_pkey PRIMARY KEY (id); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.daily_stats add constraint daily_stats_pkey PRIMARY KEY (branch_id, stat_date); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.feature_modules add constraint feature_modules_pkey PRIMARY KEY (key); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.loyalty_programs add constraint loyalty_programs_pkey PRIMARY KEY (restaurant_id); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.menu_categories add constraint menu_categories_pkey PRIMARY KEY (id); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.menu_items add constraint menu_items_pkey PRIMARY KEY (id); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.notifications add constraint notifications_pkey PRIMARY KEY (id); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.offer_redemptions add constraint offer_redemptions_pkey PRIMARY KEY (id); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.offers add constraint offers_pkey PRIMARY KEY (id); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.owner_insights add constraint owner_insights_pkey PRIMARY KEY (id); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.platform_admins add constraint platform_admins_pkey PRIMARY KEY (user_id); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.reservations add constraint reservations_pkey PRIMARY KEY (id); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.restaurant_features add constraint restaurant_features_pkey PRIMARY KEY (restaurant_id, module_key); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.restaurant_photos add constraint restaurant_photos_pkey PRIMARY KEY (id); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.restaurants add constraint restaurants_pkey PRIMARY KEY (id); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.reviews add constraint reviews_pkey PRIMARY KEY (id); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.staff add constraint staff_pkey PRIMARY KEY (id); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.tables add constraint tables_pkey PRIMARY KEY (id); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.waitlist_entries add constraint waitlist_entries_pkey PRIMARY KEY (id); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.customers add constraint customers_user_id_key UNIQUE (user_id); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.restaurants add constraint restaurants_claim_code_key UNIQUE (claim_code); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.restaurants add constraint restaurants_slug_key UNIQUE (slug); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.staff add constraint staff_user_id_restaurant_id_key UNIQUE (user_id, restaurant_id); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.tables add constraint tables_branch_id_label_key UNIQUE (branch_id, label); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.checkin_settings add constraint checkin_settings_welcome_expires_days_check CHECK (((welcome_expires_days >= 1) AND (welcome_expires_days <= 365))); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.checkin_settings add constraint checkin_settings_welcome_kind_check CHECK ((welcome_kind = ANY (ARRAY['gift'::text, 'discount'::text]))); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.checkin_settings add constraint checkin_settings_welcome_value_kind_check CHECK ((welcome_value_kind = ANY (ARRAY['percent'::text, 'amount'::text]))); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.customer_restaurant add constraint customer_restaurant_tier_check CHECK ((tier = ANY (ARRAY['regular'::text, 'silver'::text, 'gold'::text, 'vip'::text]))); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.customer_rewards add constraint customer_rewards_kind_check CHECK ((kind = ANY (ARRAY['gift'::text, 'discount'::text]))); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.customer_rewards add constraint customer_rewards_status_check CHECK ((status = ANY (ARRAY['active'::text, 'redeemed'::text, 'expired'::text]))); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.customer_rewards add constraint customer_rewards_value_kind_check CHECK ((value_kind = ANY (ARRAY['percent'::text, 'amount'::text]))); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.feature_modules add constraint feature_modules_category_check CHECK ((category = ANY (ARRAY['core'::text, 'marketing'::text, 'customer_tools'::text, 'operations'::text]))); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.offers add constraint offers_audience_check CHECK ((audience = ANY (ARRAY['all'::text, 'new'::text, 'loyalty'::text, 'walkaway'::text, 'slow_hours'::text]))); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.reservations add constraint reservations_party_size_check CHECK ((party_size > 0)); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.restaurants add constraint slug_format CHECK ((slug ~ '^[a-z0-9-]+$'::text)); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.reviews add constraint reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5))); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.tables add constraint tables_min_seats_check CHECK ((min_seats > 0)); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.tables add constraint tables_seats_check CHECK ((seats > 0)); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.waitlist_entries add constraint waitlist_entries_party_size_check CHECK ((party_size > 0)); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.waitlist_entries add constraint waitlist_entries_zone_check CHECK ((zone = ANY (ARRAY['any'::text, 'inside'::text, 'outside'::text]))); exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.branch_settings add constraint branch_settings_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.branches add constraint branches_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.checkin_settings add constraint checkin_settings_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.checkins add constraint checkins_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.checkins add constraint checkins_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.checkins add constraint checkins_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.customer_restaurant add constraint customer_restaurant_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.customer_restaurant add constraint customer_restaurant_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.customer_rewards add constraint customer_rewards_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.customer_rewards add constraint customer_rewards_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.customers add constraint customers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.daily_stats add constraint daily_stats_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.loyalty_programs add constraint loyalty_programs_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.menu_categories add constraint menu_categories_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.menu_items add constraint menu_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES menu_categories(id) ON DELETE CASCADE; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.menu_items add constraint menu_items_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.notifications add constraint notifications_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.notifications add constraint notifications_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.offer_redemptions add constraint offer_redemptions_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.offer_redemptions add constraint offer_redemptions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.offer_redemptions add constraint offer_redemptions_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.offer_redemptions add constraint offer_redemptions_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.offers add constraint offers_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.owner_insights add constraint owner_insights_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.platform_admins add constraint platform_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.reservations add constraint reservations_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.reservations add constraint reservations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.reservations add constraint reservations_table_id_fkey FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE SET NULL; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.restaurant_features add constraint restaurant_features_module_key_fkey FOREIGN KEY (module_key) REFERENCES feature_modules(key) ON DELETE CASCADE; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.restaurant_features add constraint restaurant_features_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.restaurant_photos add constraint restaurant_photos_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.restaurants add constraint restaurants_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE RESTRICT; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.reviews add constraint reviews_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.reviews add constraint reviews_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.reviews add constraint reviews_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.reviews add constraint reviews_waitlist_entry_id_fkey FOREIGN KEY (waitlist_entry_id) REFERENCES waitlist_entries(id) ON DELETE SET NULL; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.staff add constraint staff_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.staff add constraint staff_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.staff add constraint staff_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.tables add constraint tables_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.waitlist_entries add constraint waitlist_entries_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.waitlist_entries add constraint waitlist_entries_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.waitlist_entries add constraint waitlist_entries_table_id_fkey FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE SET NULL; exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin alter table public.reservations add constraint no_double_booking EXCLUDE USING gist (table_id WITH =, time_range WITH &&) WHERE (((table_id IS NOT NULL) AND (status = ANY (ARRAY['pending'::reservation_status, 'confirmed'::reservation_status, 'seated'::reservation_status])))); exception when duplicate_object then null; when duplicate_table then null; end $$;

-- ---------- الفهارس (Indexes) ----------
CREATE INDEX IF NOT EXISTS idx_branches_restaurant ON public.branches USING btree (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_checkins_customer_rest_time ON public.checkins USING btree (customer_id, restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkins_restaurant_time ON public.checkins USING btree (restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_custrest_customer ON public.customer_restaurant USING btree (customer_id);
CREATE INDEX IF NOT EXISTS idx_custrest_vip ON public.customer_restaurant USING btree (restaurant_id) WHERE is_vip;
CREATE INDEX IF NOT EXISTS idx_customer_rewards_customer ON public.customer_rewards USING btree (customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_rewards_rest_cust ON public.customer_rewards USING btree (restaurant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers USING btree (phone);
CREATE INDEX IF NOT EXISTS idx_customers_user ON public.customers USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON public.daily_stats USING btree (stat_date);
CREATE INDEX IF NOT EXISTS idx_menu_categories_restaurant ON public.menu_categories USING btree (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON public.menu_items USING btree (category_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant ON public.menu_items USING btree (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_branch ON public.notifications USING btree (branch_id);
CREATE INDEX IF NOT EXISTS idx_notifications_customer ON public.notifications USING btree (customer_id);
CREATE INDEX IF NOT EXISTS idx_offer_redemptions_branch_id ON public.offer_redemptions USING btree (branch_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_customer ON public.offer_redemptions USING btree (customer_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_offer ON public.offer_redemptions USING btree (offer_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_rest_date ON public.offer_redemptions USING btree (restaurant_id, redeemed_at);
CREATE INDEX IF NOT EXISTS idx_offers_code ON public.offers USING btree (code) WHERE (code IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_offers_rest_active ON public.offers USING btree (restaurant_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_insights_rest ON public.owner_insights USING btree (restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservations_branch ON public.reservations USING btree (branch_id);
CREATE INDEX IF NOT EXISTS idx_reservations_customer ON public.reservations USING btree (customer_id);
CREATE INDEX IF NOT EXISTS idx_reservations_reserved_at ON public.reservations USING btree (reserved_at);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON public.reservations USING btree (status);
CREATE INDEX IF NOT EXISTS idx_restaurant_features_enabled ON public.restaurant_features USING btree (restaurant_id) WHERE enabled;
CREATE INDEX IF NOT EXISTS idx_restaurant_features_module_key ON public.restaurant_features USING btree (module_key);
CREATE INDEX IF NOT EXISTS idx_restaurant_photos ON public.restaurant_photos USING btree (restaurant_id, sort_order, created_at);
CREATE INDEX IF NOT EXISTS idx_restaurants_owner ON public.restaurants USING btree (owner_id);
CREATE INDEX IF NOT EXISTS idx_reviews_branch_id ON public.reviews USING btree (branch_id);
CREATE INDEX IF NOT EXISTS idx_reviews_customer ON public.reviews USING btree (customer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_pub_restaurant ON public.reviews USING btree (restaurant_id) WHERE is_published;
CREATE INDEX IF NOT EXISTS idx_reviews_rest ON public.reviews USING btree (restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_waitlist_entry_id ON public.reviews USING btree (waitlist_entry_id);
CREATE INDEX IF NOT EXISTS idx_staff_branch ON public.staff USING btree (branch_id);
CREATE INDEX IF NOT EXISTS idx_staff_restaurant ON public.staff USING btree (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_staff_user ON public.staff USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_tables_branch ON public.tables USING btree (branch_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_active ON public.waitlist_entries USING btree (branch_id, "position") WHERE (status = ANY (ARRAY['waiting'::waitlist_status, 'notified'::waitlist_status]));
CREATE INDEX IF NOT EXISTS idx_waitlist_branch ON public.waitlist_entries USING btree (branch_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_branch_joined ON public.waitlist_entries USING btree (branch_id, joined_at);
CREATE INDEX IF NOT EXISTS idx_waitlist_branch_seated ON public.waitlist_entries USING btree (branch_id, seated_at) WHERE (status = 'seated'::waitlist_status);
CREATE INDEX IF NOT EXISTS idx_waitlist_customer ON public.waitlist_entries USING btree (customer_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_live_branch ON public.waitlist_entries USING btree (branch_id) WHERE (status = ANY (ARRAY['waiting'::waitlist_status, 'notified'::waitlist_status]));
CREATE INDEX IF NOT EXISTS idx_waitlist_status ON public.waitlist_entries USING btree (status);
CREATE INDEX IF NOT EXISTS idx_waitlist_table ON public.waitlist_entries USING btree (table_id) WHERE (table_id IS NOT NULL);

-- ---------- المحفّزات (Triggers) ----------
CREATE OR REPLACE TRIGGER t_settings BEFORE UPDATE ON public.branch_settings FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE OR REPLACE TRIGGER t_branch_default_settings AFTER INSERT ON public.branches FOR EACH ROW EXECUTE FUNCTION create_default_branch_settings();
CREATE OR REPLACE TRIGGER t_branches BEFORE UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE OR REPLACE TRIGGER trg_custrest_touch BEFORE UPDATE ON public.customer_restaurant FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE OR REPLACE TRIGGER t_customers BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE OR REPLACE TRIGGER trg_loyalty_touch BEFORE UPDATE ON public.loyalty_programs FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE OR REPLACE TRIGGER t_menu_items BEFORE UPDATE ON public.menu_items FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE OR REPLACE TRIGGER trg_offers_touch BEFORE UPDATE ON public.offers FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE OR REPLACE TRIGGER t_reservations BEFORE UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE OR REPLACE TRIGGER t_reservations_time_range BEFORE INSERT OR UPDATE OF reserved_at, duration_min ON public.reservations FOR EACH ROW EXECUTE FUNCTION set_reservation_time_range();
CREATE OR REPLACE TRIGGER trg_restaurant_features_touch BEFORE UPDATE ON public.restaurant_features FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE OR REPLACE TRIGGER t_restaurants BEFORE UPDATE ON public.restaurants FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE OR REPLACE TRIGGER t_waitlist BEFORE UPDATE ON public.waitlist_entries FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE OR REPLACE TRIGGER t_waitlist_position BEFORE INSERT ON public.waitlist_entries FOR EACH ROW EXECUTE FUNCTION set_waitlist_position();
CREATE OR REPLACE TRIGGER trg_waitlist_visit AFTER UPDATE OF status ON public.waitlist_entries FOR EACH ROW EXECUTE FUNCTION on_waitlist_status_change();

-- ---------- تفعيل RLS ----------
alter table public.branch_settings enable row level security;
alter table public.branches enable row level security;
alter table public.checkin_settings enable row level security;
alter table public.checkins enable row level security;
alter table public.customer_restaurant enable row level security;
alter table public.customer_rewards enable row level security;
alter table public.customers enable row level security;
alter table public.daily_stats enable row level security;
alter table public.feature_modules enable row level security;
alter table public.loyalty_programs enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.notifications enable row level security;
alter table public.offer_redemptions enable row level security;
alter table public.offers enable row level security;
alter table public.owner_insights enable row level security;
alter table public.platform_admins enable row level security;
alter table public.reservations enable row level security;
alter table public.restaurant_features enable row level security;
alter table public.restaurant_photos enable row level security;
alter table public.restaurants enable row level security;
alter table public.reviews enable row level security;
alter table public.staff enable row level security;
alter table public.tables enable row level security;
alter table public.waitlist_entries enable row level security;

-- ---------- سياسات RLS (Policies) ----------
drop policy if exists "managers manage settings" on public.branch_settings;
create policy "managers manage settings" on public.branch_settings as permissive for all to public
  using (is_manager_of(restaurant_of_branch(branch_id)))
  with check (is_manager_of(restaurant_of_branch(branch_id)));
drop policy if exists platform_admin_all on public.branch_settings;
create policy platform_admin_all on public.branch_settings as permissive for all to authenticated
  using (is_platform_admin())
  with check (is_platform_admin());
drop policy if exists "public read settings of active branches" on public.branch_settings;
create policy "public read settings of active branches" on public.branch_settings as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM branches b
  WHERE ((b.id = branch_settings.branch_id) AND (b.is_active = true)))));
drop policy if exists "staff reads settings" on public.branch_settings;
create policy "staff reads settings" on public.branch_settings as permissive for select to public
  using (is_staff_of(restaurant_of_branch(branch_id)));
drop policy if exists "admin manages branches" on public.branches;
create policy "admin manages branches" on public.branches as permissive for all to public
  using (is_platform_admin())
  with check (is_platform_admin());
drop policy if exists "managers manage branches" on public.branches;
create policy "managers manage branches" on public.branches as permissive for all to public
  using (is_manager_of(restaurant_id))
  with check (is_manager_of(restaurant_id));
drop policy if exists "public read active branches" on public.branches;
create policy "public read active branches" on public.branches as permissive for select to public
  using ((is_active = true));
drop policy if exists "staff read branches" on public.branches;
create policy "staff read branches" on public.branches as permissive for select to public
  using (is_staff_of(restaurant_id));
drop policy if exists checkin_settings_read on public.checkin_settings;
create policy checkin_settings_read on public.checkin_settings as permissive for select to public
  using ((is_staff_of(restaurant_id) OR is_platform_admin()));
drop policy if exists checkin_settings_write on public.checkin_settings;
create policy checkin_settings_write on public.checkin_settings as permissive for all to public
  using ((is_manager_of(restaurant_id) OR is_platform_admin()))
  with check ((is_manager_of(restaurant_id) OR is_platform_admin()));
drop policy if exists checkins_admin_all on public.checkins;
create policy checkins_admin_all on public.checkins as permissive for all to public
  using (is_platform_admin())
  with check (is_platform_admin());
drop policy if exists checkins_read on public.checkins;
create policy checkins_read on public.checkins as permissive for select to public
  using ((is_staff_of(restaurant_id) OR is_platform_admin()));
drop policy if exists "customer reads own profile" on public.customer_restaurant;
create policy "customer reads own profile" on public.customer_restaurant as permissive for select to public
  using ((customer_id IN ( SELECT customers.id
   FROM customers
  WHERE (customers.user_id = ( SELECT auth.uid() AS uid)))));
drop policy if exists "managers manage customer profiles" on public.customer_restaurant;
create policy "managers manage customer profiles" on public.customer_restaurant as permissive for all to public
  using ((staff_has_perm(restaurant_id, 'customers'::text) OR is_platform_admin()))
  with check ((staff_has_perm(restaurant_id, 'customers'::text) OR is_platform_admin()));
drop policy if exists "staff reads customer profiles" on public.customer_restaurant;
create policy "staff reads customer profiles" on public.customer_restaurant as permissive for select to public
  using ((is_staff_of(restaurant_id) OR is_platform_admin()));
drop policy if exists "staff manage rewards" on public.customer_rewards;
create policy "staff manage rewards" on public.customer_rewards as permissive for all to authenticated
  using ((staff_has_perm(restaurant_id, 'customers'::text) OR is_platform_admin()))
  with check ((staff_has_perm(restaurant_id, 'customers'::text) OR is_platform_admin()));
drop policy if exists "customer inserts self" on public.customers;
create policy "customer inserts self" on public.customers as permissive for insert to public
  with check ((user_id = ( SELECT auth.uid() AS uid)));
drop policy if exists "customer reads self" on public.customers;
create policy "customer reads self" on public.customers as permissive for select to public
  using ((user_id = ( SELECT auth.uid() AS uid)));
drop policy if exists "customer updates self" on public.customers;
create policy "customer updates self" on public.customers as permissive for update to public
  using ((user_id = ( SELECT auth.uid() AS uid)))
  with check ((user_id = ( SELECT auth.uid() AS uid)));
drop policy if exists platform_admin_all on public.customers;
create policy platform_admin_all on public.customers as permissive for all to authenticated
  using (is_platform_admin())
  with check (is_platform_admin());
drop policy if exists "staff reads branch customers" on public.customers;
create policy "staff reads branch customers" on public.customers as permissive for select to public
  using (staff_can_read_customer(id));
drop policy if exists "staff reads own daily stats" on public.daily_stats;
create policy "staff reads own daily stats" on public.daily_stats as permissive for select to public
  using ((is_staff_of(restaurant_of_branch(branch_id)) OR is_platform_admin()));
drop policy if exists "admin manages modules catalog" on public.feature_modules;
create policy "admin manages modules catalog" on public.feature_modules as permissive for all to public
  using (is_platform_admin())
  with check (is_platform_admin());
drop policy if exists "anyone reads modules catalog" on public.feature_modules;
create policy "anyone reads modules catalog" on public.feature_modules as permissive for select to public
  using (true);
drop policy if exists "managers manage loyalty" on public.loyalty_programs;
create policy "managers manage loyalty" on public.loyalty_programs as permissive for all to public
  using ((staff_has_perm(restaurant_id, 'loyalty'::text) OR is_platform_admin()))
  with check ((staff_has_perm(restaurant_id, 'loyalty'::text) OR is_platform_admin()));
drop policy if exists "public reads active loyalty" on public.loyalty_programs;
create policy "public reads active loyalty" on public.loyalty_programs as permissive for select to public
  using (is_active);
drop policy if exists "staff reads loyalty" on public.loyalty_programs;
create policy "staff reads loyalty" on public.loyalty_programs as permissive for select to public
  using ((is_staff_of(restaurant_id) OR is_platform_admin()));
drop policy if exists "managers manage menu categories" on public.menu_categories;
create policy "managers manage menu categories" on public.menu_categories as permissive for all to public
  using (is_manager_of(restaurant_id))
  with check (is_manager_of(restaurant_id));
drop policy if exists platform_admin_all on public.menu_categories;
create policy platform_admin_all on public.menu_categories as permissive for all to authenticated
  using (is_platform_admin())
  with check (is_platform_admin());
drop policy if exists "public read menu categories" on public.menu_categories;
create policy "public read menu categories" on public.menu_categories as permissive for select to public
  using (true);
drop policy if exists "managers manage menu items" on public.menu_items;
create policy "managers manage menu items" on public.menu_items as permissive for all to public
  using (is_manager_of(restaurant_id))
  with check (is_manager_of(restaurant_id));
drop policy if exists platform_admin_all on public.menu_items;
create policy platform_admin_all on public.menu_items as permissive for all to authenticated
  using (is_platform_admin())
  with check (is_platform_admin());
drop policy if exists "public read menu items" on public.menu_items;
create policy "public read menu items" on public.menu_items as permissive for select to public
  using (true);
drop policy if exists "staff reads notifications" on public.notifications;
create policy "staff reads notifications" on public.notifications as permissive for select to public
  using (is_staff_of(restaurant_of_branch(branch_id)));
drop policy if exists "customer reads own redemptions" on public.offer_redemptions;
create policy "customer reads own redemptions" on public.offer_redemptions as permissive for select to public
  using ((customer_id IN ( SELECT customers.id
   FROM customers
  WHERE (customers.user_id = ( SELECT auth.uid() AS uid)))));
drop policy if exists "staff reads redemptions" on public.offer_redemptions;
create policy "staff reads redemptions" on public.offer_redemptions as permissive for select to public
  using ((is_staff_of(restaurant_id) OR is_platform_admin()));
drop policy if exists "staff records redemption" on public.offer_redemptions;
create policy "staff records redemption" on public.offer_redemptions as permissive for insert to public
  with check (is_staff_of(restaurant_id));
drop policy if exists "managers manage offers" on public.offers;
create policy "managers manage offers" on public.offers as permissive for all to public
  using ((staff_has_perm(restaurant_id, 'offers'::text) OR is_platform_admin()))
  with check ((staff_has_perm(restaurant_id, 'offers'::text) OR is_platform_admin()));
drop policy if exists "public reads live offers" on public.offers;
create policy "public reads live offers" on public.offers as permissive for select to public
  using ((is_active AND ((starts_at IS NULL) OR (starts_at <= now())) AND ((ends_at IS NULL) OR (ends_at >= now()))));
drop policy if exists "staff reads all offers" on public.offers;
create policy "staff reads all offers" on public.offers as permissive for select to public
  using ((is_staff_of(restaurant_id) OR is_platform_admin()));
drop policy if exists "managers update own insights" on public.owner_insights;
create policy "managers update own insights" on public.owner_insights as permissive for update to public
  using ((is_manager_of(restaurant_id) OR is_platform_admin()))
  with check ((is_manager_of(restaurant_id) OR is_platform_admin()));
drop policy if exists "staff reads own insights" on public.owner_insights;
create policy "staff reads own insights" on public.owner_insights as permissive for select to public
  using ((is_staff_of(restaurant_id) OR is_platform_admin()));
drop policy if exists "customer cancels own reservation" on public.reservations;
create policy "customer cancels own reservation" on public.reservations as permissive for update to public
  using ((customer_id IN ( SELECT customers.id
   FROM customers
  WHERE (customers.user_id = ( SELECT auth.uid() AS uid)))));
drop policy if exists "customer creates reservation" on public.reservations;
create policy "customer creates reservation" on public.reservations as permissive for insert to public
  with check ((customer_id IN ( SELECT customers.id
   FROM customers
  WHERE (customers.user_id = ( SELECT auth.uid() AS uid)))));
drop policy if exists "customer reads own reservations" on public.reservations;
create policy "customer reads own reservations" on public.reservations as permissive for select to public
  using ((customer_id IN ( SELECT customers.id
   FROM customers
  WHERE (customers.user_id = ( SELECT auth.uid() AS uid)))));
drop policy if exists platform_admin_all on public.reservations;
create policy platform_admin_all on public.reservations as permissive for all to authenticated
  using (is_platform_admin())
  with check (is_platform_admin());
drop policy if exists "staff manages branch reservations" on public.reservations;
create policy "staff manages branch reservations" on public.reservations as permissive for all to public
  using (is_staff_of(restaurant_of_branch(branch_id)))
  with check (is_staff_of(restaurant_of_branch(branch_id)));
drop policy if exists "admin manages features" on public.restaurant_features;
create policy "admin manages features" on public.restaurant_features as permissive for all to public
  using (is_platform_admin())
  with check (is_platform_admin());
drop policy if exists "staff reads own features" on public.restaurant_features;
create policy "staff reads own features" on public.restaurant_features as permissive for select to public
  using ((is_staff_of(restaurant_id) OR is_platform_admin()));
drop policy if exists "managers manage photos" on public.restaurant_photos;
create policy "managers manage photos" on public.restaurant_photos as permissive for all to public
  using ((staff_has_perm(restaurant_id, 'settings'::text) OR is_platform_admin()))
  with check ((staff_has_perm(restaurant_id, 'settings'::text) OR is_platform_admin()));
drop policy if exists "public reads photos" on public.restaurant_photos;
create policy "public reads photos" on public.restaurant_photos as permissive for select to public
  using (true);
drop policy if exists "admin reads all restaurants" on public.restaurants;
create policy "admin reads all restaurants" on public.restaurants as permissive for select to public
  using (is_platform_admin());
drop policy if exists "manager or admin updates restaurant" on public.restaurants;
create policy "manager or admin updates restaurant" on public.restaurants as permissive for update to authenticated
  using ((is_manager_of(id) OR is_platform_admin()))
  with check ((is_manager_of(id) OR is_platform_admin()));
drop policy if exists "owner reads own restaurant" on public.restaurants;
create policy "owner reads own restaurant" on public.restaurants as permissive for select to public
  using ((owner_id = ( SELECT auth.uid() AS uid)));
drop policy if exists "owner updates own restaurant" on public.restaurants;
create policy "owner updates own restaurant" on public.restaurants as permissive for update to public
  using ((owner_id = ( SELECT auth.uid() AS uid)))
  with check ((owner_id = ( SELECT auth.uid() AS uid)));
drop policy if exists "public read active restaurants" on public.restaurants;
create policy "public read active restaurants" on public.restaurants as permissive for select to public
  using ((is_active = true));
drop policy if exists "staff read own restaurant" on public.restaurants;
create policy "staff read own restaurant" on public.restaurants as permissive for select to public
  using (is_staff_of(id));
drop policy if exists "customer writes own review" on public.reviews;
create policy "customer writes own review" on public.reviews as permissive for insert to public
  with check ((customer_id IN ( SELECT customers.id
   FROM customers
  WHERE (customers.user_id = ( SELECT auth.uid() AS uid)))));
drop policy if exists "managers manage reviews" on public.reviews;
create policy "managers manage reviews" on public.reviews as permissive for all to public
  using ((staff_has_perm(restaurant_id, 'reviews'::text) OR is_platform_admin()))
  with check ((staff_has_perm(restaurant_id, 'reviews'::text) OR is_platform_admin()));
drop policy if exists "public reads published reviews" on public.reviews;
create policy "public reads published reviews" on public.reviews as permissive for select to public
  using (is_published);
drop policy if exists "staff reads all reviews" on public.reviews;
create policy "staff reads all reviews" on public.reviews as permissive for select to public
  using ((is_staff_of(restaurant_id) OR is_platform_admin()));
drop policy if exists "managers manage team" on public.staff;
create policy "managers manage team" on public.staff as permissive for all to public
  using (is_manager_of(restaurant_id))
  with check (is_manager_of(restaurant_id));
drop policy if exists platform_admin_all on public.staff;
create policy platform_admin_all on public.staff as permissive for all to authenticated
  using (is_platform_admin())
  with check (is_platform_admin());
drop policy if exists "staff read team" on public.staff;
create policy "staff read team" on public.staff as permissive for select to public
  using (is_staff_of(restaurant_id));
drop policy if exists "managers manage tables" on public.tables;
create policy "managers manage tables" on public.tables as permissive for all to public
  using (is_manager_of(restaurant_of_branch(branch_id)))
  with check (is_manager_of(restaurant_of_branch(branch_id)));
drop policy if exists platform_admin_all on public.tables;
create policy platform_admin_all on public.tables as permissive for all to authenticated
  using (is_platform_admin())
  with check (is_platform_admin());
drop policy if exists "staff read tables" on public.tables;
create policy "staff read tables" on public.tables as permissive for select to public
  using (is_staff_of(restaurant_of_branch(branch_id)));
drop policy if exists "customer joins waitlist" on public.waitlist_entries;
create policy "customer joins waitlist" on public.waitlist_entries as permissive for insert to public
  with check ((customer_id IN ( SELECT customers.id
   FROM customers
  WHERE (customers.user_id = ( SELECT auth.uid() AS uid)))));
drop policy if exists "customer reads own waitlist" on public.waitlist_entries;
create policy "customer reads own waitlist" on public.waitlist_entries as permissive for select to public
  using ((customer_id IN ( SELECT customers.id
   FROM customers
  WHERE (customers.user_id = ( SELECT auth.uid() AS uid)))));
drop policy if exists platform_admin_all on public.waitlist_entries;
create policy platform_admin_all on public.waitlist_entries as permissive for all to authenticated
  using (is_platform_admin())
  with check (is_platform_admin());
drop policy if exists "staff manages branch waitlist" on public.waitlist_entries;
create policy "staff manages branch waitlist" on public.waitlist_entries as permissive for all to public
  using (is_staff_of(restaurant_of_branch(branch_id)))
  with check (is_staff_of(restaurant_of_branch(branch_id)));

-- ---------- محفّز الأحداث: تفعيل RLS تلقائيًّا لأي جدول جديد ----------
drop event trigger if exists ensure_rls;
create event trigger ensure_rls on ddl_command_end when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO') execute function rls_auto_enable();

-- نهاية لقطة المخطط.
