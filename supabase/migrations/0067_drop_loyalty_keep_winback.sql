-- 0067 — اقتلاع النقاط والمستويات والأختام من القاعدة، وإبقاء ما يخصّ المالك.
--
-- الواجهة نُزعت في 0066 وما قبلها، وبقيت الآلية تعمل في الخلف: كل إجلاس
-- يزيد نقاطًا لا يراها أحد، ويحسب مستوى لا يُعرَض، ويصرف مكافأة عند عتبة
-- لا يعرفها الزبون. حسابات تجري لغير قارئ.
--
-- ما يبقى كاملًا — ولا يُمسّ:
--   • معرفة المالك بعميله: الزيارات، آخر زيارة، عدم الحضور، الملاحظات
--   • تصنيفاته: الوسوم والمميّز — والمالك هو من يضعها
--   • الاسترجاع: يرجّع الغائب بهدية، لا بنقاط
--   • منح الهدايا لعميل أو لشريحة
--
-- ما يُحذف: النقاط والمستويات والأختام وصفحة المسح بالهدية.
--
-- الترتيب مقصود: تُبنى البدائل وتُعاد كتابة الدوال أولًا، ثم يُسقط القديم.
-- ‏plpgsql لا يفحص الجداول إلا وقت التشغيل، فدالة لم تُعَد كتابتها قبل
-- الإسقاط تنفجر على أول نداء لا عند الترحيل.

-- ═══════════════════════════════════════════════════════════════
-- ١) بيت جديد لإعدادات الاسترجاع
-- ═══════════════════════════════════════════════════════════════
-- كانت تسكن loyalty_programs مع النقاط والعتبات. الاسترجاع باقٍ والنقاط
-- تُحذف، فينتقل لجدوله ومعه بياناته — لا يضيع ما ضبطه المالك.

create table if not exists public.winback_settings (
  restaurant_id  uuid primary key references public.restaurants(id) on delete cascade,
  is_active      boolean     not null default false,
  title          text        not null default 'اشتقنا لك — هدية عودة 🎁',
  value          numeric,
  value_kind     text        not null default 'percent'
                 check (value_kind in ('percent','amount')),
  days_inactive  int         not null default 30 check (days_inactive between 7 and 365),
  updated_at     timestamptz not null default now()
);

comment on table public.winback_settings is
  'إعداد هدية الاسترجاع لكل مطعم. خلَف الأعمدة winback_* من loyalty_programs بعد حذف منظومة النقاط.';

-- نقل ما ضبطه المالك فعلًا
insert into public.winback_settings (restaurant_id, is_active, title, value, value_kind)
select lp.restaurant_id,
       coalesce(lp.winback_enabled, false),
       coalesce(nullif(btrim(lp.winback_title), ''), 'اشتقنا لك — هدية عودة 🎁'),
       lp.winback_value,
       case when lp.winback_value_kind in ('percent','amount') then lp.winback_value_kind else 'percent' end
from public.loyalty_programs lp
on conflict (restaurant_id) do nothing;

alter table public.winback_settings enable row level security;

drop policy if exists "staff manage winback" on public.winback_settings;
create policy "staff manage winback" on public.winback_settings
  for all
  using  (public.staff_has_perm(restaurant_id, 'customers') or public.is_platform_admin())
  with check (public.staff_has_perm(restaurant_id, 'customers') or public.is_platform_admin());

-- ═══════════════════════════════════════════════════════════════
-- ٢) مشغّل الإجلاس — أخطر دالة هنا
-- ═══════════════════════════════════════════════════════════════
-- كان يقرأ checkins ليمنع ازدواج النقاط، ويحسب مستوى، ويصرف مكافأة عند
-- عتبة. لا نقاط ولا مستويات ولا مسح بعد اليوم، فيبقى ما ينفع المالك:
-- عدّ الزيارة، وآخر زيارة، وعدم الحضور، وتنبيه المغادرة.
create or replace function public.on_waitlist_status_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  rid uuid;
  cust_name text;
begin
  if new.customer_id is null then return new; end if;
  rid := public.restaurant_of_branch(new.branch_id);

  if new.status = 'seated' and old.status is distinct from 'seated'
     and new.visit_counted_at is null then
    -- زيارة واحدة لكل صف مهما تقلّبت الحالة
    update public.waitlist_entries set visit_counted_at = now() where id = new.id;

    insert into public.customer_restaurant (restaurant_id, customer_id, visits, last_visit, first_seen)
    values (rid, new.customer_id, 1, coalesce(new.seated_at, now()), now())
    on conflict (restaurant_id, customer_id) do update set
      visits     = customer_restaurant.visits + 1,
      last_visit = greatest(customer_restaurant.last_visit, excluded.last_visit),
      updated_at = now();

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
      coalesce(cust_name, 'عميل') || ' غادر قبل دوره — فرصة لاستعادته بهدية.',
      jsonb_build_object('customer_id', new.customer_id, 'entry_id', new.id));
  end if;

  return new;
end;
$function$;

-- ═══════════════════════════════════════════════════════════════
-- ٣) حارس قراءة العملاء (RLS)
-- ═══════════════════════════════════════════════════════════════
-- كان يمنح الوصول عبر ثلاثة مسارات: طابور، حجز، مسح. المسح يُحذف فيبقى
-- مساران. تضييق لا توسيع: من كان يُرى بالمسح وحده لم يعد يُرى.
create or replace function public.staff_can_read_customer(cust_id uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $function$
  select public.is_platform_admin()
      or exists (select 1 from public.waitlist_entries w
                  where w.customer_id = cust_id
                    and w.branch_id = any (coalesce((select public.my_branch_ids()), array[]::uuid[])))
      or exists (select 1 from public.reservations r
                  where r.customer_id = cust_id
                    and r.branch_id = any (coalesce((select public.my_branch_ids()), array[]::uuid[])));
$function$;

-- ═══════════════════════════════════════════════════════════════
-- ٤) الاسترجاع التلقائي — على الجدول الجديد
-- ═══════════════════════════════════════════════════════════════
-- نفس التوقيع (كرون auto_winback يناديها) ونفس الحارس ضد الإزعاج:
-- لا هدية استرجاع ثانية خلال ٦٠ يومًا. الجديد أن مدّة الغياب صارت
-- بيد المالك بدل ثلاثين يومًا مثبّتة في الكود.
create or replace function public.run_auto_winback()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare v_granted int := 0;
begin
  with targets as (
    select cr.restaurant_id, cr.customer_id, ws.title, ws.value, ws.value_kind
    from public.customer_restaurant cr
    join public.winback_settings ws
      on ws.restaurant_id = cr.restaurant_id and ws.is_active
    where cr.is_blocked = false
      and cr.last_visit is not null
      and cr.last_visit < now() - make_interval(days => ws.days_inactive)
      and not exists (
        select 1 from public.customer_rewards r
        where r.restaurant_id = cr.restaurant_id
          and r.customer_id = cr.customer_id
          and r.description = 'هدية استرجاع تلقائية'
          and r.created_at > now() - interval '60 days')
  ),
  ins as (
    insert into public.customer_rewards
      (restaurant_id, customer_id, kind, title, value, value_kind, description, status, expires_at)
    select restaurant_id, customer_id,
           case when value is null then 'gift' else 'discount' end,
           title, value, value_kind,
           'هدية استرجاع تلقائية', 'active', now() + interval '14 days'
    from targets
    returning 1
  )
  select count(*) into v_granted from ins;
  return v_granted;
end $function$;

-- ═══════════════════════════════════════════════════════════════
-- ٥) منح هدية لشريحة — التصنيفات على أساس جديد
-- ═══════════════════════════════════════════════════════════════
-- كانت gold وsilver مشتقّتين من نقاط لم يرها أحد. صارت الشرائح على ما
-- يعرفه المالك ويضعه بنفسه: المميّز، والعائد، والجديد، والغائب.
create or replace function public.grant_reward_to_segment(
  p_restaurant_id uuid, p_segment text, p_kind text, p_title text,
  p_value numeric, p_value_kind text, p_description text, p_code text,
  p_expires_at timestamptz)
returns integer
language plpgsql
security definer
set search_path to 'public'
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
    and cr.is_blocked = false
    and case p_segment
          when 'vip'       then cr.is_vip
          when 'returning' then cr.visits >= 2
          when 'new'       then coalesce(cr.visits, 0) <= 1
          when 'dormant'   then cr.last_visit is not null
                                and cr.last_visit < now() - interval '30 days'
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

-- ═══════════════════════════════════════════════════════════════
-- ٦) الملخّص الأسبوعي — بلا سطر المسح
-- ═══════════════════════════════════════════════════════════════
create or replace function public.run_weekly_digest()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare v_count int := 0; r record;
begin
  for r in
    select rst.id as rid, rst.name,
      (select count(*) from public.waitlist_entries w
        join public.branches b on b.id = w.branch_id
        where b.restaurant_id = rst.id and w.status = 'seated'
          and w.seated_at > now() - interval '7 days') as served,
      (select count(*) from public.customer_restaurant cr
        where cr.restaurant_id = rst.id and cr.first_seen > now() - interval '7 days') as new_customers,
      (select count(*) from public.reviews rv
        where rv.restaurant_id = rst.id and rv.created_at > now() - interval '7 days') as new_reviews,
      (select round(avg(rv.rating)::numeric, 1) from public.reviews rv
        where rv.restaurant_id = rst.id and rv.created_at > now() - interval '7 days') as avg_rating
    from public.restaurants rst where rst.is_active
  loop
    -- لا ملخّص لمطعم بلا أي نشاط — لا نزعج بالأصفار
    continue when r.served = 0 and r.new_customers = 0 and r.new_reviews = 0;
    insert into public.owner_insights (restaurant_id, kind, title, body)
    values (r.rid, 'daily_digest',
      'ملخّص أسبوعك 📊',
      'خدمتم ' || r.served || ' ضيفًا، وانضم ' || r.new_customers || ' عميل جديد' ||
      case when r.new_reviews > 0
        then '، ووصلكم ' || r.new_reviews || ' تقييم بمتوسط ' || coalesce(r.avg_rating::text,'—') || '★'
        else '' end || '.');
    v_count := v_count + 1;
  end loop;
  return v_count;
end $function$;

-- ═══════════════════════════════════════════════════════════════
-- ٧) التقييم — الزيارة تُثبَت بالإجلاس وحده
-- ═══════════════════════════════════════════════════════════════
-- كان يقبل المسح كإثبات زيارة. المسح يُحذف، فيبقى الإجلاس خلال ٧ أيام.
-- تضييق مقصود: التقييم يبقى لمن جلس فعلًا.
create or replace function public.submit_review(
  p_slug text, p_phone text, p_rating integer, p_comment text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_norm text; v_rid uuid; v_cid uuid; v_branch uuid; v_entry uuid; v_existing uuid;
begin
  v_norm := public.norm_phone_input(p_phone);
  if length(v_norm) <> 9 then
    return jsonb_build_object('ok', false, 'error', 'invalid_phone');
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    return jsonb_build_object('ok', false, 'error', 'invalid_rating');
  end if;
  if not public.check_rate('review:p:' || v_norm, 5, interval '24 hours') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select r.id into v_rid from public.restaurants r where r.slug = p_slug and r.is_active;
  if v_rid is null then
    return jsonb_build_object('ok', false, 'error', 'restaurant_not_found');
  end if;

  select c.id into v_cid from public.customers c
  where right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 9) = v_norm
  order by c.created_at limit 1;
  if v_cid is null then
    return jsonb_build_object('ok', false, 'error', 'no_visit');
  end if;

  select w.branch_id, w.id into v_branch, v_entry
  from public.waitlist_entries w
  join public.branches b on b.id = w.branch_id
  where w.customer_id = v_cid and b.restaurant_id = v_rid
    and w.status = 'seated' and w.seated_at > now() - interval '7 days'
  order by w.seated_at desc limit 1;

  if v_branch is null then
    return jsonb_build_object('ok', false, 'error', 'no_visit');
  end if;

  select rv.id into v_existing from public.reviews rv
  where rv.restaurant_id = v_rid and rv.customer_id = v_cid limit 1;

  if v_existing is not null then
    update public.reviews
       set rating = p_rating,
           comment = nullif(left(btrim(coalesce(p_comment,'')), 500), ''),
           branch_id = v_branch,
           created_at = now()
     where id = v_existing;
  else
    insert into public.reviews (restaurant_id, branch_id, customer_id, waitlist_entry_id, rating, comment, is_published)
    values (v_rid, v_branch, v_cid, v_entry, p_rating,
            nullif(left(btrim(coalesce(p_comment,'')), 500), ''), true);
  end if;

  return jsonb_build_object('ok', true);
end $function$;

-- ═══════════════════════════════════════════════════════════════
-- ٨) «وضعي مع هذا المطعم» — بلا نقاط ولا مستوى
-- ═══════════════════════════════════════════════════════════════
create or replace function public.my_restaurant_status(p_slug text, p_phone text)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_norm text; v_rid uuid; v_cid uuid; v_row record; v_name text;
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

  select visits, last_visit into v_row
  from public.customer_restaurant
  where restaurant_id = v_rid and customer_id = v_cid;
  if v_row is null or coalesce(v_row.visits, 0) = 0 then
    return jsonb_build_object('known', false);
  end if;

  return jsonb_build_object(
    'known', true,
    'name', v_name,
    'visits', v_row.visits,
    'last_visit', v_row.last_visit);
end $function$;

-- ═══════════════════════════════════════════════════════════════
-- ٩) إسقاط ما لم يبقَ له معنى
-- ═══════════════════════════════════════════════════════════════
-- cascade هنا يسقط trg_default_checkin_settings المعتمد على دالته.
drop function if exists public.create_default_checkin_settings() cascade;
drop function if exists public.get_customer_loyalty(text)              cascade;
drop function if exists public.tier_for_visits(uuid, integer)          cascade;
drop function if exists public.public_checkin(text, text, text, uuid)  cascade;
drop function if exists public.public_checkin(text, text, uuid, text)  cascade;

-- أي توقيع آخر لـ public_checkin (تغيّرت وسائطها عبر الترحيلات)
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'public_checkin'
  loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;
end $$;

drop table if exists public.checkins          cascade;
drop table if exists public.checkin_settings  cascade;
drop table if exists public.loyalty_programs  cascade;

alter table public.customer_restaurant drop column if exists points;
alter table public.customer_restaurant drop column if exists tier;

-- ═══════════════════════════════════════════════════════════════
-- ١٠) تنظيف الكتالوج والصلاحيات
-- ═══════════════════════════════════════════════════════════════
delete from public.restaurant_features where module_key in ('loyalty','checkin');
delete from public.feature_modules   where key        in ('loyalty','checkin');

-- صلاحية loyalty لم تعد تحرس شيئًا: منح الهدايا محروس بصلاحية customers.
-- ‏permissions من نوع jsonb، والعامل «‎-‎» يحذف عنصر مصفوفة بقيمته.
update public.staff
   set permissions = permissions - 'loyalty'
 where permissions ? 'loyalty';
