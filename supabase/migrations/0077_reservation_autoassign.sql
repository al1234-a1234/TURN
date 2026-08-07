-- ============================================================================
--  الحجز يعيّن طاولته بنفسه — «أفضل مقاس يكفي»
--
--  الحجوزات كانت تُنشأ بـ table_id فارغ، فلا تحجز شيئًا فعليًّا: قيد
--  no_double_booking لا يعمل إلا حين تكون الطاولة معيَّنة، وحسابُ «هل امتلأنا»
--  مستحيلٌ بلا طاولة. النتيجة أن المطعم يقبل حجوزات لا يعرف هل يفي بها.
--
--  هنا ثلاث دوال:
--    ‏pick_table_for      — أنسب طاولة شاغرة (أصغر مقاسٍ يكفي)
--    ‏reservation_slots   — الأوقات المتاحة فعلًا لعددٍ وقسمٍ في يوم
--    ‏book_reservation_guest — حجز الضيف: يختار الطاولة ويحجزها
--
--  والقاعدة تبقى الحارس الأخير: التزامن يُحسم بـ no_double_booking لا بشرطٍ
--  في التطبيق قد يسبقه طلبٌ آخر بجزءٍ من الثانية.
-- ============================================================================

-- ── ١) أنسب طاولة ─────────────────────────────────────────────────────────
-- «أصغر مقاسٍ يكفي»: لا نُجلس اثنين على طاولة ستّة فنحرق سعتنا، ولا نُجلس
-- ستّة على أربعة فنكذب. و`min_seats` احتياطُ المالك حين يريد ألّا تُستعمل
-- طاولةٌ كبيرة لمجموعةٍ صغيرة أصلًا.
create or replace function public.pick_table_for(
  p_branch_id  uuid,
  p_party      integer,
  p_zone       text,
  p_at         timestamptz,
  p_duration   integer
) returns uuid
language sql
stable
security definer
set search_path to ''
as $$
  select t.id
  from public.tables t
  where t.branch_id = p_branch_id
    and t.is_active
    and (p_zone is null or t.zone = p_zone)
    and t.seats >= p_party
    and coalesce(t.min_seats, 1) <= p_party
    and not exists (
      select 1
      from public.reservations r
      where r.table_id = t.id
        and r.status in ('pending', 'confirmed', 'seated')
        and r.time_range && tstzrange(
              p_at, p_at + make_interval(mins => greatest(p_duration, 15)), '[)')
    )
  order by t.seats asc, t.sort_order asc, t.label asc
  limit 1
$$;

-- ── ٢) الأوقات المتاحة ────────────────────────────────────────────────────
-- لا نعرض وقتًا سيُرفض. المواعيد كل نصف ساعة من الفتح، وآخر موعدٍ يترك مدّة
-- الجلسة كاملة قبل الإغلاق — لا نبيع عشاءً لا يتّسع وقته.
create or replace function public.reservation_slots(
  p_branch_id uuid,
  p_day       date,
  p_party     integer,
  p_zone      text default null
) returns table (slot_at timestamptz, table_id uuid)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_hours    jsonb;
  v_duration int;
  v_window   int;
  v_open     timestamptz;
  v_close    timestamptz;
  v_party    int := greatest(coalesce(p_party, 1), 1);
  v_zone     text := case when p_zone in ('inside','outside') then p_zone else null end;
  v_t        timestamptz;
  v_tbl      uuid;
begin
  select bs.opening_hours, coalesce(bs.default_duration_min, 90), coalesce(bs.booking_window_days, 30)
    into v_hours, v_duration, v_window
  from public.branch_settings bs
  where bs.branch_id = p_branch_id;

  if v_hours is null then return; end if;

  -- خارج نافذة الحجز أو في الماضي: لا مواعيد
  if p_day < (now() at time zone 'Asia/Riyadh')::date
     or p_day > ((now() at time zone 'Asia/Riyadh')::date + v_window) then
    return;
  end if;

  -- أوقات الدوام بتوقيت الرياض؛ الإغلاق بعد منتصف الليل يُحسب لليوم التالي
  v_open  := ((p_day::text || ' ' || coalesce(v_hours->>'open',  '12:00'))::timestamp)
               at time zone 'Asia/Riyadh';
  v_close := ((p_day::text || ' ' || coalesce(v_hours->>'close', '23:00'))::timestamp)
               at time zone 'Asia/Riyadh';
  if v_close <= v_open then v_close := v_close + interval '1 day'; end if;

  v_t := v_open;
  while v_t + make_interval(mins => v_duration) <= v_close loop
    -- ولا نعرض موعدًا فات: المواعيد تبدأ من الآن فصاعدًا
    if v_t > now() then
      v_tbl := public.pick_table_for(p_branch_id, v_party, v_zone, v_t, v_duration);
      if v_tbl is not null then
        slot_at := v_t; table_id := v_tbl; return next;
      end if;
    end if;
    v_t := v_t + interval '30 minutes';
  end loop;
end;
$$;

-- ── ٣) حجز الضيف ──────────────────────────────────────────────────────────
-- بلا حساب ولا كلمة مرور — كما الطابور تمامًا. والحدّ يمنع من يعبث بالمواعيد
-- فيُغلق مطعمًا كاملًا بحجوزاتٍ وهمية.
create or replace function public.book_reservation_guest(
  p_branch_id   uuid,
  p_full_name   text,
  p_phone       text,
  p_reserved_at timestamptz,
  p_party_size  integer default 2,
  p_zone        text default null,
  p_notes       text default null
) returns table (reservation_id uuid, table_label text, reserved_at timestamptz)
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_name     text := left(trim(p_full_name), 120);
  v_phone    text := trim(p_phone);
  v_zone     text := case when p_zone in ('inside','outside') then p_zone else null end;
  v_accepts  boolean;
  v_active   boolean;
  v_duration int;
  v_window   int;
  v_maxparty int;
  v_party    int;
  v_cust     uuid;
  v_tbl      uuid;
  v_res      uuid;
begin
  if v_name = '' or v_phone = '' then
    raise exception 'الاسم والرقم مطلوبان' using errcode = '22023';
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

  -- يُقصّ ولا يُرفض — نفس مبدأ الطابور
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

  -- عميل الضيف: نفس منطق الطابور (رقمٌ واحد = عميلٌ واحد)
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

  -- القاعدة هي الحارس الأخير: طلبان على نفس الطاولة في نفس اللحظة يفوز
  -- أوّلهما، ونعيد المحاولة مرّةً بطاولةٍ أخرى قبل أن نعتذر.
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
-- pick_table_for داخلية: تكشف خريطة إشغال المطعم لمن يستدعيها بحرّية،
-- فتبقى للخادم والدوالّ الأخرى لا للضيف.
revoke all on function public.pick_table_for(uuid, integer, text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.pick_table_for(uuid, integer, text, timestamptz, integer) to service_role;

-- وهاتان يحتاجهما الضيف ليحجز بلا حساب
grant execute on function public.reservation_slots(uuid, date, integer, text) to anon, authenticated, service_role;
grant execute on function public.book_reservation_guest(uuid, text, text, timestamptz, integer, text, text) to anon, authenticated, service_role;
