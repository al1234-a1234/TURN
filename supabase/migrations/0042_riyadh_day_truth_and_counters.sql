-- «يوم» المنصّة هو يوم الرياض — لا يوم UTC:
--   ١) rollup_daily_stats كانت حدودها UTC (يومها من ٣ فجرًا إلى ٣ فجرًا)
--      وساعة الذروة UTC (ذروة ٨ مساءً تُسجَّل ٥ مساءً). صُحّحت.
--   ٢) run_daily_digest كذلك، وكانت تمسح جدول الطابور كاملًا لكل مطعم كل
--      ليلة. صارت قراءة واحدة من daily_stats.
--   ٣) عدّادات «بالطابور الآن» العامة لم تكن تصفّي باليوم — صف منسي من أمس
--      يضخّم العدّاد للأبد ويكسر تطابق الأرقام بين الشاشات. صُفّيت بيوم الرياض.
--   ٤) كنس ليلي يُقفل صفوف الأمس المنسيّة (expired) قبل التجميع.
--   ٥) فهارس ناقصة + فهرسان فريدان يمنعان سباقَي النقر المزدوج وتشظّي العميل.
--   ٦) صيانة دورية + جدولة الكرون على يوم الرياض.

create or replace function public.rollup_daily_stats(p_branch_id uuid, p_date date)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
DECLARE
  d_start timestamptz := (p_date::timestamp at time zone 'Asia/Riyadh');
  d_end   timestamptz := ((p_date + 1)::timestamp at time zone 'Asia/Riyadh');
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
    (SELECT EXTRACT(HOUR FROM joined_at at time zone 'Asia/Riyadh')::smallint
       FROM public.waitlist_entries w2
      WHERE w2.branch_id = p_branch_id AND w2.joined_at >= d_start AND w2.joined_at < d_end
      GROUP BY 1 ORDER BY count(*) DESC LIMIT 1),
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

create or replace function public.run_daily_digest()
returns integer
language plpgsql security definer set search_path to 'public'
as $function$
DECLARE
  n int := 0;
  v_date date := (now() at time zone 'Asia/Riyadh')::date - 1;
BEGIN
  INSERT INTO public.owner_insights (restaurant_id, kind, title, body, data)
  SELECT b.restaurant_id, 'daily_digest', 'ملخّص أمس',
         'خدمت ' || sum(ds.seated_count) || ' طاولة، انضم ' || sum(ds.joined_count)
           || ' للطابور، وغادر ' || sum(ds.cancelled_count) || '.',
         jsonb_build_object('served', sum(ds.seated_count), 'joined', sum(ds.joined_count),
                            'cancelled', sum(ds.cancelled_count), 'date', v_date)
  FROM public.daily_stats ds
  JOIN public.branches b ON b.id = ds.branch_id
  JOIN public.restaurants r ON r.id = b.restaurant_id AND r.is_active
  WHERE ds.stat_date = v_date
  GROUP BY b.restaurant_id
  HAVING sum(ds.joined_count) > 0;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$function$;

create or replace function public.waitlist_counts(b_id uuid)
returns table(total integer, inside integer, outside integer)
language sql stable security definer set search_path to ''
as $function$
  select
    count(*)::int,
    count(*) filter (where zone = 'inside')::int,
    count(*) filter (where zone = 'outside')::int
  from public.waitlist_entries
  where branch_id = b_id
    and status in ('waiting', 'notified')
    and (joined_at at time zone 'Asia/Riyadh')::date = (now() at time zone 'Asia/Riyadh')::date;
$function$;

create or replace function public.waitlist_counts_for(p_branch_ids uuid[])
returns table(branch_id uuid, total bigint, inside bigint, outside bigint)
language sql stable security definer set search_path to 'public'
as $function$
  select w.branch_id,
         count(*),
         count(*) filter (where w.zone = 'inside'),
         count(*) filter (where w.zone = 'outside')
  from public.waitlist_entries w
  where w.status in ('waiting','notified')
    and w.branch_id = any(p_branch_ids)
    and (w.joined_at at time zone 'Asia/Riyadh')::date = (now() at time zone 'Asia/Riyadh')::date
  group by w.branch_id;
$function$;

create or replace function public.expire_stale_waitlist()
returns integer
language plpgsql security definer set search_path to 'public'
as $function$
declare n int;
begin
  update public.waitlist_entries set status = 'expired'
   where status in ('waiting','notified')
     and (joined_at at time zone 'Asia/Riyadh')::date < (now() at time zone 'Asia/Riyadh')::date;
  get diagnostics n = row_count;
  return n;
end $function$;
revoke execute on function public.expire_stale_waitlist() from public, anon, authenticated;

create index if not exists idx_reservations_branch_time on public.reservations (branch_id, reserved_at);
create index if not exists idx_checkins_branch_time on public.checkins (branch_id, created_at desc);
create index if not exists idx_custrest_rest_visits on public.customer_restaurant (restaurant_id, visits desc);
create index if not exists idx_waitlist_branch_seated_all on public.waitlist_entries (branch_id, seated_at) where seated_at is not null;
create index if not exists idx_customer_rewards_active on public.customer_rewards (restaurant_id, customer_id) where status = 'active';

create unique index if not exists uniq_customers_phone_guest
  on public.customers (phone) where user_id is null;
create unique index if not exists uniq_waitlist_live_customer_branch
  on public.waitlist_entries (branch_id, customer_id) where status in ('waiting','notified');

create or replace function public.join_waitlist_guest(p_branch_id uuid, p_full_name text, p_phone text, p_party_size integer default 1, p_zone text default 'inside')
returns table(queue_pos integer, entry_id uuid)
language plpgsql security definer set search_path to ''
as $function$
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

    -- حدّ المعدّل بعد فحص «دور قائم» كي لا يُحاسَب تحديث التذكرة
    if not public.check_rate('join:p:' || public.norm_phone_input(v_phone), 3, interval '10 minutes')
       or not public.check_rate('join:b:' || p_branch_id::text, 30, interval '1 minute') then
        raise exception 'محاولات كثيرة — انتظر دقائق ثم حاول' using errcode = 'P0429';
    end if;

    -- إنشاء/إيجاد العميل — الفهرس الفريد يمنع التشظّي والسباق يعود للصف القائم
    begin
        select id into v_cust_id from public.customers where phone = v_phone and user_id is null limit 1;
        if v_cust_id is null then
            insert into public.customers (full_name, phone) values (v_name, v_phone) returning id into v_cust_id;
        else
            update public.customers set full_name = v_name where id = v_cust_id;
        end if;
    exception when unique_violation then
        select id into v_cust_id from public.customers where phone = v_phone and user_id is null limit 1;
    end;

    -- إدخال الدور — نقرة مزدوجة متزامنة تعود للدور الذي سبق
    begin
        insert into public.waitlist_entries (branch_id, customer_id, party_size, zone)
             values (p_branch_id, v_cust_id, v_party, v_zone)
          returning waitlist_entries.position, id into v_pos, v_eid;
    exception when unique_violation then
        select w.position, w.id into v_pos, v_eid
          from public.waitlist_entries w
         where w.branch_id = p_branch_id and w.customer_id = v_cust_id
           and w.status in ('waiting','notified')
         limit 1;
    end;

    queue_pos := v_pos; entry_id := v_eid; return next;
end;
$function$;

create or replace function public.run_slow_hours()
returns integer
language plpgsql security definer set search_path to 'public'
as $function$
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
    WHERE b.restaurant_id = r.rid AND w.status IN ('waiting','notified')
      AND (w.joined_at at time zone 'Asia/Riyadh')::date = (now() at time zone 'Asia/Riyadh')::date;

    IF COALESCE(active_q,0) = 0 THEN
      UPDATE public.offers SET is_active = true, updated_at = now()
      WHERE restaurant_id = r.rid AND audience = 'slow_hours' AND is_active = false;
      GET DIAGNOSTICS changed = ROW_COUNT;
      IF changed > 0 AND NOT EXISTS (
        SELECT 1 FROM public.owner_insights oi
        WHERE oi.restaurant_id = r.rid AND oi.kind = 'slow_hours'
          AND oi.created_at > now() - interval '12 hours'
      ) THEN
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

create or replace function public.delete_dead_push_subscription(p_endpoint text)
returns void
language sql security definer set search_path to ''
as $function$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$function$;
grant execute on function public.delete_dead_push_subscription(text) to anon, authenticated;

create or replace function public.run_retention()
returns void
language sql security definer set search_path to 'public'
as $function$
  delete from public.owner_insights where created_at < now() - interval '90 days';
  delete from public.push_subscriptions where created_at < now() - interval '180 days';
$function$;
revoke execute on function public.run_retention() from public, anon, authenticated;

-- الجدولة على يوم الرياض: الكنس ٠٠:٠٥ ← التجميع ٠٠:١٠ ← الملخّص ٠٠:٣٠ ← الصيانة ٠١:٠٠
select cron.unschedule(jobid) from cron.job where jobname in ('rollup-daily','daily-digest');
select cron.schedule('expire-stale',  '5 21 * * *',  $cron$SELECT public.expire_stale_waitlist()$cron$);
select cron.schedule('rollup-daily',  '10 21 * * *', $cron$SELECT public.rollup_all_daily_stats(((now() at time zone 'Asia/Riyadh')::date - 1))$cron$);
select cron.schedule('daily-digest',  '30 21 * * *', $cron$SELECT public.run_daily_digest()$cron$);
select cron.schedule('retention',     '0 22 * * *',  $cron$SELECT public.run_retention()$cron$);
