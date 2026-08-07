-- ============================================================================
--  الدوالّ تكفّ عن معرفة «داخلي/خارجي» بالاسم
--
--  ‏0080 فتحت الأقسام، لكن أربع دوالّ بقيت تحمل قائمةً بيضاء مثبّتة:
--      case when p_zone in ('inside','outside') then p_zone else … end
--  فاختبارٌ على قسمٍ ثالث («عوائل») أظهر أن الدور يُسجَّل في «داخلي» بدلًا
--  منه — أي أن العميل يختار قسمًا ويقف في غيره، وهو أسوأ من رفضٍ صريح.
--
--  ثم كشف اختبارٌ ثانٍ تسريبين أدقّ:
--    • طلبُ قسمٍ مُطفأ كان يتحوّل إلى «أيّ قسم» بصمت (سبعة مواعيد في غير ما
--      طُلب). الفرق بين «لم يُطلب قسم» و«طُلب قسمٌ غير صالح» يجب أن يُقال.
--    • طاولات القسم المُطفأ بقيت تُحجَز تحت «أيّ قسم» — أي أن الإطفاء لم
--      يكن يُخرجها من التداول أصلًا.
--
--  القاعدة الآن: مَن يكتب في جدولٍ يحرسه trg_*_zone_belongs يمرّر القسم كما
--  هو ويترك الحارس يصحّحه (مصدرٌ واحد للحقيقة)، ومَن يستعمله للتصفية يتحقّق
--  منه بـ valid_branch_zone ويرفض صراحةً إن لم يصحّ.
-- ============================================================================

-- ── القسم الصالح: مفتاحٌ فعّالٌ يخصّ هذا الفرع، وإلا NULL ─────────────────
create or replace function public.valid_branch_zone(p_branch_id uuid, p_zone text)
returns text
language sql stable security definer set search_path to ''
as $$
  select z.key from public.branch_zones z
  where z.branch_id = p_branch_id and z.key = nullif(btrim(p_zone), '') and z.is_active
  limit 1;
$$;

-- ── الطاولة تتبع حالة قسمها ───────────────────────────────────────────────
create or replace function public.pick_table_for(
  p_branch_id uuid, p_party integer, p_zone text,
  p_at timestamptz, p_duration integer
) returns uuid
language sql stable security definer set search_path to ''
as $$
  select t.id
  from public.tables t
  where t.branch_id = p_branch_id
    and t.is_active
    and (p_zone is null or t.zone = p_zone)
    -- قسمٌ مُطفأ يُخرج طاولاته من التداول. وطاولةٌ بلا قسمٍ معرَّف تبقى
    -- متاحة: هي بيانات قديمة لا قرار مالك.
    and not exists (
      select 1 from public.branch_zones z
      where z.branch_id = t.branch_id and z.key = t.zone and not z.is_active
    )
    and t.seats >= p_party
    and coalesce(t.min_seats, 1) <= p_party
    and not exists (
      select 1 from public.reservations r
      where r.table_id = t.id
        and r.status in ('pending', 'confirmed', 'seated')
        and r.time_range && tstzrange(
              p_at, p_at + make_interval(mins => greatest(p_duration, 15)), '[)')
    )
  order by t.seats asc, t.sort_order asc, t.label asc
  limit 1
$$;

-- ── الطابور: العميل ───────────────────────────────────────────────────────
create or replace function public.join_waitlist_guest(
  p_branch_id uuid, p_full_name text, p_phone text,
  p_party_size integer default 1, p_zone text default 'inside'
) returns table(queue_pos integer, entry_id uuid)
language plpgsql security definer set search_path to ''
as $function$
declare
    v_name  text := left(trim(p_full_name), 120);
    v_phone text := trim(p_phone);
    v_party int;
    v_maxparty int;
    -- بلا قائمةٍ بيضاء: trg_waitlist_zone_belongs يتحقّق أن القسم يخصّ هذا
    -- الفرع ويقصّه لأوّل قسمٍ فعّال إن لم يكن.
    v_zone text := nullif(btrim(p_zone), '');
    v_branch_active boolean;
    v_accepts boolean; v_closed boolean; v_hours jsonb;
    v_cust_id uuid; v_pos int; v_eid uuid;
begin
    if v_name = '' or v_phone = '' then
        raise exception 'الاسم والرقم مطلوبان' using errcode = '22023';
    end if;

    select is_active into v_branch_active from public.branches where id = p_branch_id;
    if v_branch_active is distinct from true then
        raise exception 'الفرع غير متاح' using errcode = 'P0002';
    end if;

    select accepts_waitlist, manually_closed, opening_hours, coalesce(max_party_size, 20)
      into v_accepts, v_closed, v_hours, v_maxparty
      from public.branch_settings where branch_id = p_branch_id;
    if v_accepts is false then
        raise exception 'هذا الفرع لا يستقبل قائمة انتظار حاليًا' using errcode = 'P0001';
    end if;
    if v_closed is true or not public.branch_open_by_hours(v_hours) then
        raise exception 'الفرع مغلق حاليًا' using errcode = 'P0003';
    end if;

    -- سقف المالك لا رقمٌ ثابت (0079)
    v_party := least(greatest(coalesce(p_party_size, 1), 1), greatest(coalesce(v_maxparty, 20), 1));

    if not public.check_rate('join:p:' || public.norm_phone_input(v_phone), 3, interval '10 minutes')
       or not public.check_rate('join:b:' || p_branch_id::text, 600, interval '1 minute') then
        raise exception 'محاولات كثيرة — انتظر دقائق ثم حاول' using errcode = 'P0429';
    end if;

    select w.position, w.id into v_pos, v_eid
      from public.waitlist_entries w
      join public.customers c on c.id = w.customer_id
     where w.branch_id = p_branch_id and c.phone = v_phone
       and w.status in ('waiting', 'notified')
     order by w.joined_at desc limit 1;
    if v_eid is not null then
        queue_pos := v_pos; entry_id := v_eid; return next; return;
    end if;

    begin
        select id into v_cust_id from public.customers where phone = v_phone and user_id is null limit 1;
        if v_cust_id is null then
            insert into public.customers (full_name, phone) values (v_name, v_phone) returning id into v_cust_id;
        else
            update public.customers set full_name = v_name
             where id = v_cust_id and coalesce(btrim(full_name),'') = '';
        end if;
    exception when unique_violation then
        select id into v_cust_id from public.customers where phone = v_phone and user_id is null limit 1;
    end;

    begin
        insert into public.waitlist_entries (branch_id, customer_id, party_size, zone)
             values (p_branch_id, v_cust_id, v_party, v_zone)
          returning waitlist_entries.position, id into v_pos, v_eid;
    exception when unique_violation then
        select w.position, w.id into v_pos, v_eid
          from public.waitlist_entries w
         where w.branch_id = p_branch_id and w.customer_id = v_cust_id
           and w.status in ('waiting','notified') limit 1;
    end;

    queue_pos := v_pos; entry_id := v_eid; return next;
end;
$function$;

-- ── الطابور: المضيف (بلا سقفٍ عمدًا — يرى الناس أمامه ويضمّ طاولتين) ──────
create or replace function public.staff_add_walkin(
  p_branch_id uuid, p_full_name text, p_phone text,
  p_party_size integer default 1, p_zone text default 'inside'
) returns table(queue_pos integer, entry_id uuid)
language plpgsql security definer set search_path to ''
as $function$
declare
  v_name  text := coalesce(nullif(trim(p_full_name), ''), 'ضيف');
  v_phone text := trim(p_phone);
  v_party int  := greatest(coalesce(p_party_size, 1), 1);
  v_zone  text := nullif(btrim(p_zone), '');
  v_cust_id uuid; v_pos int; v_eid uuid;
begin
  if not public.can_access_branch(p_branch_id) then
    raise exception 'غير مصرّح' using errcode = '42501';
  end if;
  if v_phone = '' then
    raise exception 'الرقم مطلوب' using errcode = '22023';
  end if;

  select w."position", w.id into v_pos, v_eid
    from public.waitlist_entries w
    join public.customers c on c.id = w.customer_id
   where w.branch_id = p_branch_id and c.phone = v_phone
     and w.status in ('waiting','notified')
   order by w.joined_at desc limit 1;
  if v_eid is not null then
    queue_pos := v_pos; entry_id := v_eid; return next; return;
  end if;

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

  begin
    insert into public.waitlist_entries (branch_id, customer_id, party_size, zone)
         values (p_branch_id, v_cust_id, v_party, v_zone)
      returning waitlist_entries."position", id into v_pos, v_eid;
  exception when unique_violation then
    select w."position", w.id into v_pos, v_eid
      from public.waitlist_entries w
     where w.branch_id = p_branch_id and w.customer_id = v_cust_id
       and w.status in ('waiting','notified') limit 1;
  end;

  queue_pos := v_pos; entry_id := v_eid; return next;
end $function$;

-- ── المواعيد: قسمٌ غير صالح ⇐ لا مواعيد، لا بديل ─────────────────────────
create or replace function public.reservation_slots(
  p_branch_id uuid, p_day date, p_party integer, p_zone text default null
) returns table (slot_at timestamptz, table_id uuid)
language plpgsql stable security definer set search_path to ''
as $$
declare
  v_hours jsonb; v_duration int; v_window int;
  v_local timestamp; v_open timestamptz; v_close timestamptz;
  v_party int := greatest(coalesce(p_party, 1), 1);
  v_asked text := nullif(btrim(p_zone), '');
  v_zone text := public.valid_branch_zone(p_branch_id, p_zone);
  v_t timestamptz; v_tbl uuid;
  v_lead interval := interval '15 minutes';
begin
  if v_asked is not null and v_zone is null then return; end if;

  select bs.opening_hours, coalesce(bs.default_duration_min, 90), coalesce(bs.booking_window_days, 30)
    into v_hours, v_duration, v_window
  from public.branch_settings bs where bs.branch_id = p_branch_id;

  if v_hours is null then return; end if;

  if p_day < (now() at time zone 'Asia/Riyadh')::date
     or p_day > ((now() at time zone 'Asia/Riyadh')::date + v_window) then
    return;
  end if;

  -- التقريب على timestamp مجرّد لا timestamptz: الثاني يتبع منطقة الجلسة
  -- (UTC على الخادم) فينزلق ثلاث ساعات.
  v_local := (p_day::text || ' ' || coalesce(v_hours->>'open', '12:00'))::timestamp;
  v_local := date_trunc('hour', v_local)
             + interval '30 minutes' * ceil(extract(minute from v_local) / 30.0);
  v_open  := v_local at time zone 'Asia/Riyadh';

  v_close := ((p_day::text || ' ' || coalesce(v_hours->>'close', '23:00'))::timestamp)
               at time zone 'Asia/Riyadh';
  if v_close <= v_open then v_close := v_close + interval '1 day'; end if;

  v_t := v_open;
  while v_t + make_interval(mins => v_duration) <= v_close loop
    if v_t > now() + v_lead then
      v_tbl := public.pick_table_for(p_branch_id, v_party, v_zone, v_t, v_duration);
      if v_tbl is not null then
        slot_at := v_t; table_id := v_tbl; return next;
      end if;
    end if;
    v_t := v_t + interval '30 minutes';
  end loop;
end;
$$;

-- ── الحجز: يرفض القسم غير الصالح صراحةً بدل أن يحجز في غيره ──────────────
create or replace function public.book_reservation_guest(
  p_branch_id uuid, p_full_name text, p_phone text, p_reserved_at timestamptz,
  p_party_size integer default 2, p_zone text default null, p_notes text default null
) returns table (reservation_id uuid, table_label text, reserved_at timestamptz)
language plpgsql security definer set search_path to ''
as $$
declare
  v_name text := left(trim(p_full_name), 120);
  v_phone text := trim(p_phone);
  v_asked text := nullif(btrim(p_zone), '');
  v_zone text := public.valid_branch_zone(p_branch_id, p_zone);
  v_accepts boolean; v_active boolean;
  v_duration int; v_window int; v_maxparty int; v_party int;
  v_cust uuid; v_tbl uuid; v_res uuid;
begin
  if v_name = '' or v_phone = '' then
    raise exception 'الاسم والرقم مطلوبان' using errcode = '22023';
  end if;
  if v_asked is not null and v_zone is null then
    raise exception 'هذا القسم غير متاح في هذا الفرع' using errcode = 'P0008';
  end if;

  select b.is_active into v_active from public.branches b where b.id = p_branch_id;
  if v_active is distinct from true then
    raise exception 'الفرع غير متاح' using errcode = 'P0002';
  end if;

  select bs.accepts_reservations, coalesce(bs.default_duration_min, 90),
         coalesce(bs.booking_window_days, 30), coalesce(bs.max_party_size, 20)
    into v_accepts, v_duration, v_window, v_maxparty
  from public.branch_settings bs where bs.branch_id = p_branch_id;

  if v_accepts is false then
    raise exception 'هذا الفرع لا يستقبل حجوزات حاليًا' using errcode = 'P0001';
  end if;

  v_party := least(greatest(coalesce(p_party_size, 2), 1), v_maxparty);

  if p_reserved_at <= now() then
    raise exception 'الموعد في الماضي' using errcode = 'P0004';
  end if;
  if p_reserved_at > now() + make_interval(days => v_window) then
    raise exception 'الموعد أبعد من نافذة الحجز' using errcode = 'P0005';
  end if;

  if not public.check_rate('resv:p:' || public.norm_phone_input(v_phone), 5, interval '1 hour')
     or not public.check_rate('resv:b:' || p_branch_id::text, 300, interval '1 minute') then
    raise exception 'محاولات كثيرة — انتظر ثم حاول' using errcode = 'P0429';
  end if;

  v_tbl := public.pick_table_for(p_branch_id, v_party, v_zone, p_reserved_at, v_duration);
  if v_tbl is null then
    raise exception 'لا توجد طاولة شاغرة في هذا الوقت' using errcode = 'P0006';
  end if;

  begin
    select c.id into v_cust from public.customers c
     where c.phone = v_phone and c.user_id is null limit 1;
    if v_cust is null then
      insert into public.customers (full_name, phone) values (v_name, v_phone)
        returning id into v_cust;
    else
      update public.customers set full_name = v_name
       where id = v_cust and coalesce(btrim(full_name), '') = '';
    end if;
  exception when unique_violation then
    select c.id into v_cust from public.customers c
     where c.phone = v_phone and c.user_id is null limit 1;
  end;

  -- القاعدة هي الحارس الأخير: التزامن يُحسم بـ no_double_booking
  begin
    insert into public.reservations
      (branch_id, customer_id, table_id, party_size, reserved_at, duration_min, notes, status)
    values
      (p_branch_id, v_cust, v_tbl, v_party, p_reserved_at, v_duration,
       nullif(trim(p_notes), ''), 'confirmed')
    returning id into v_res;
  exception when exclusion_violation then
    v_tbl := public.pick_table_for(p_branch_id, v_party, v_zone, p_reserved_at, v_duration);
    if v_tbl is null then
      raise exception 'امتلأ هذا الوقت للتوّ' using errcode = 'P0007';
    end if;
    insert into public.reservations
      (branch_id, customer_id, table_id, party_size, reserved_at, duration_min, notes, status)
    values
      (p_branch_id, v_cust, v_tbl, v_party, p_reserved_at, v_duration,
       nullif(trim(p_notes), ''), 'confirmed')
    returning id into v_res;
  end;

  reservation_id := v_res;
  select t.label into table_label from public.tables t where t.id = v_tbl;
  reserved_at := p_reserved_at;
  return next;
end;
$$;

-- ── الصلاحيات ─────────────────────────────────────────────────────────────
revoke all on function public.pick_table_for(uuid, integer, text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.pick_table_for(uuid, integer, text, timestamptz, integer) to service_role;
grant execute on function public.valid_branch_zone(uuid, text) to anon, authenticated, service_role;
grant execute on function public.reservation_slots(uuid, date, integer, text) to anon, authenticated, service_role;
grant execute on function public.book_reservation_guest(uuid, text, text, timestamptz, integer, text, text) to anon, authenticated, service_role;
