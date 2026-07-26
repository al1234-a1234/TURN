-- تسويق تلقائي: هدية استرجاع لمن انقطع ٣٠ يومًا، ملخّص أسبوعي، وأوقات الازدحام
-- المعتادة (تلميح للعميل قبل الزيارة).

alter table public.loyalty_programs add column if not exists winback_enabled boolean not null default false;
alter table public.loyalty_programs add column if not exists winback_title text;
alter table public.loyalty_programs add column if not exists winback_value numeric;
alter table public.loyalty_programs add column if not exists winback_value_kind text;

CREATE OR REPLACE FUNCTION public.run_auto_winback()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_granted int := 0;
begin
  -- لكل مطعم مفعِّل: عملاء انقطعوا +٣٠ يومًا، غير محظورين، ولم يستلموا استرجاعًا
  -- خلال ٦٠ يومًا (كي لا تتحول الهدية إلى إزعاج).
  with targets as (
    select cr.restaurant_id, cr.customer_id, lp.winback_title, lp.winback_value, lp.winback_value_kind
    from public.customer_restaurant cr
    join public.loyalty_programs lp
      on lp.restaurant_id = cr.restaurant_id and lp.is_active and lp.winback_enabled
    where cr.is_blocked = false
      and cr.last_visit is not null
      and cr.last_visit < now() - interval '30 days'
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
    select restaurant_id, customer_id, 'gift', winback_title, winback_value, winback_value_kind,
           'هدية استرجاع تلقائية', 'active', now() + interval '14 days'
    from targets
    returning 1
  )
  select count(*) into v_granted from ins;
  return v_granted;
end $function$;
revoke execute on function public.run_auto_winback() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.run_weekly_digest()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_count int := 0; r record;
begin
  for r in
    select rst.id as rid, rst.name,
      (select count(*) from public.waitlist_entries w
        join public.branches b on b.id = w.branch_id
        where b.restaurant_id = rst.id and w.status = 'seated'
          and w.seated_at > now() - interval '7 days') as served,
      (select count(*) from public.checkins ci
        where ci.restaurant_id = rst.id and ci.created_at > now() - interval '7 days') as scans,
      (select count(*) from public.customer_restaurant cr
        where cr.restaurant_id = rst.id and cr.first_seen > now() - interval '7 days') as new_customers,
      (select count(*) from public.reviews rv
        where rv.restaurant_id = rst.id and rv.created_at > now() - interval '7 days') as new_reviews,
      (select round(avg(rv.rating)::numeric, 1) from public.reviews rv
        where rv.restaurant_id = rst.id and rv.created_at > now() - interval '7 days') as avg_rating
    from public.restaurants rst where rst.is_active
  loop
    -- لا ملخّص لمطعم بلا أي نشاط — لا نزعج بالأصفار
    continue when r.served = 0 and r.scans = 0 and r.new_customers = 0 and r.new_reviews = 0;
    insert into public.owner_insights (restaurant_id, kind, title, body)
    values (r.rid, 'daily_digest',
      'ملخّص أسبوعك 📊',
      'خدمتم ' || r.served || ' ضيفًا، وسجّل ' || r.scans || ' زيارة بالمسح، وانضم ' ||
      r.new_customers || ' عميل جديد' ||
      case when r.new_reviews > 0
        then '، ووصلكم ' || r.new_reviews || ' تقييم بمتوسط ' || coalesce(r.avg_rating::text,'—') || '★'
        else '' end || '.');
    v_count := v_count + 1;
  end loop;
  return v_count;
end $function$;
revoke execute on function public.run_weekly_digest() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.branch_busy_hours(p_branch_id uuid)
 RETURNS TABLE(hour_riyadh integer, joins bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select extract(hour from (w.joined_at at time zone 'Asia/Riyadh'))::int as h,
         count(*) as joins
  from public.waitlist_entries w
  where w.branch_id = p_branch_id
    and w.joined_at > now() - interval '28 days'
  group by 1
  having count(*) >= 3          -- تجاهل الضجيج: أقل من ٣ انضمامات ليست نمطًا
  order by joins desc
  limit 3;
$function$;
grant execute on function public.branch_busy_hours(uuid) to anon, authenticated;
