-- ═══ 0126: حرّاس سباقات التجليس والتكرار — تدقيقٌ عدائيّ قبل أول ذروة ═══
--
-- طلبٌ مباشر بعد قصة مطعمٍ حقيقية (٣ ساعات عطل حجوزات = ٢٠ تقييمًا سلبيًّا
-- هوت بتقييمه من 4.9 إلى 4.6): «أخاف من حجزٍ يضيع أو يعلق أو يتكرّر،
-- ومن لخبطة التجليس». فُحصت المسارات الأربعة فعليًّا على الإنتاج:
--
--   ✓ سليم أصلًا — دور الطابور المزدوج: كبستان متتاليتان تُعيدان نفس
--     الدور (uniq_waitlist_live_customer_branch + معالج unique_violation).
--   ✓ سليم أصلًا — طاولة محجوزة مرتين: قيد استبعاد GIST رياضيّ
--     (no_double_booking) يستحيل معه تداخل حجزين حيّين على طاولة.
--   ✗ ثغرة ١ — كبسة حجزٍ مزدوجة: تُنشئ حجزين لنفس العميل على طاولتين
--     مختلفتين، فتحترق طاولةٌ كاملة وقت الذروة ويتكرّر الاسم على شاشة
--     الاستقبال. (قيد الطاولة لا يمسكها: الدالة تختار طاولةً «أخرى» شاغرة.)
--   ✗ ثغرة ٢ — قلب الحالات النهائية: حارس الطابور كان يمنع الإحياء
--     (منتهٍ ← حيّ) فقط، ويسمح بـ«جالس ← لم يحضر» — موظفٌ بشاشةٍ لم
--     تُحدَّث يقلب سجلَّ عميلٍ قاعدٍ يأكل. والحجوزات بلا حارسٍ إطلاقًا.
--
-- ── (أ) الطابور: الحالة النهائية تتجمّد كليًّا ──
-- الواجهة لا تعرض أي زرٍّ على صفٍّ منتهٍ أصلًا — الوحيد القادر على إرسال
-- هذا الانتقال شاشةٌ قديمة أو سباق، وهو بالضبط ما يُمنع. تصحيح خطأ
-- التجليس بالاسترجاع ممنوعٌ منذ 0106 (لا إحياء) — هذه القاعدة نفسها تمتد.
create or replace function public.guard_waitlist_status_transition()
returns trigger
language plpgsql
set search_path to ''
as $fn$
begin
  if old.status in ('seated','cancelled','expired','no_show')
     and new.status is distinct from old.status then
    raise exception
      'انتقال غير مسموح: % ← % (الحالة النهائية لا تُقلب — شاشة قديمة؟ حدِّث اللوحة)', old.status, new.status
      using errcode = '23514';
  end if;
  return new;
end;
$fn$;

-- ── (ب) الحجوزات: حارسٌ لم يكن موجودًا أصلًا ──
-- المسموح: pending/confirmed ← بعضهما و← seated/cancelled/no_show،
-- وseated ← completed وحدها. النهائيّ (completed/cancelled/no_show) مجمّد.
-- «جالس ← لم يحضر» — عقدة قصة المطعم — صارت مستحيلة.
create or replace function public.guard_reservation_status_transition()
returns trigger
language plpgsql
set search_path to ''
as $fn$
begin
  if old.status in ('completed','cancelled','no_show')
     and new.status is distinct from old.status then
    raise exception
      'انتقال غير مسموح: % ← % (حجزٌ منتهٍ لا يُقلب — شاشة قديمة؟ حدِّث اللوحة)', old.status, new.status
      using errcode = '23514';
  end if;
  if old.status = 'seated' and new.status not in ('seated','completed') then
    raise exception
      'انتقال غير مسموح: جالسٌ فعلًا لا يصير «%» (شاشة قديمة؟ حدِّث اللوحة)', new.status
      using errcode = '23514';
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_guard_reservation_status on public.reservations;
create trigger trg_guard_reservation_status
  before update of status on public.reservations
  for each row execute function public.guard_reservation_status_transition();

-- ── (ج) الحجز المزدوج بالكبسة/إعادة المحاولة: يُعاد الحجزُ القائم ──
-- نافذة تطابقٍ ٩٠ ثانية على (العميل، الفرع، الموعد، العدد): توقيع الكبسة
-- المزدوجة وإعادة إرسال الشبكة حصرًا — متطابقان بالكامل ومتلاصقان زمنًا.
-- حجزُ طاولتين عمدًا لعائلةٍ كبيرة (رقمٌ واحد، عددان مختلفان أو بفاصلٍ
-- زمني) يمرّ طبيعيًّا — لهذا لا قيدَ قاعدةٍ صلبًا هنا، بل مطابقة دقيقة.
-- (نمط الطابور نفسه: الكبسة الثانية تُعيد الأولى بدل أن تكرّرها.)
create or replace function public.book_reservation_guest(p_branch_id uuid, p_full_name text, p_phone text, p_reserved_at timestamp with time zone, p_party_size integer DEFAULT 2, p_zone text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
returns table(reservation_id uuid, table_label text, reserved_at timestamp with time zone)
language plpgsql
security definer
set search_path to ''
as $fn$
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

  -- كبسة مزدوجة/إعادة محاولة: نفس العميل حجز نفسَ الموعد بنفس العدد قبل
  -- أقل من ٩٠ ثانية؟ أعد له حجزه القائم — قبل حدّ المعدّل كي لا تأكل
  -- إعادة المحاولة من رصيده ولا تُرفض به.
  select c.id into v_cust from public.customers c
   where c.phone = v_phone and c.user_id is null limit 1;
  if v_cust is not null then
    select r.id, t.label into v_res, table_label
      from public.reservations r
      left join public.tables t on t.id = r.table_id
     where r.customer_id = v_cust
       and r.branch_id = p_branch_id
       and r.reserved_at = p_reserved_at
       and r.party_size = v_party
       and r.status in ('pending', 'confirmed')
       and r.created_at > now() - interval '90 seconds'
     limit 1;
    if v_res is not null then
      reservation_id := v_res;
      reserved_at := p_reserved_at;
      return next;
      return;
    end if;
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
$fn$;
