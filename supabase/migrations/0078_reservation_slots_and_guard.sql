-- ============================================================================
--  مواعيدُ على الساعة، وحارسٌ لا يُلتَفّ عليه
--
--  ثلاثة أمور كشفها أول اختبارٍ على بياناتٍ حقيقية:
--
--  ١) المواعيد كانت تخرج ١٦:٢٠ و١٦:٥٠ و١٧:٢٠… لأن الشبكة تبدأ من وقت الفتح
--     (١٠:٥٠) وتخطو نصف ساعة. لا مطعمَ في الدنيا يقول «موعدك ٤:٥٠». تُقرَّب
--     البداية لأعلى إلى نصف ساعةٍ كاملة فتصير ١١:٠٠، ١١:٣٠، ١٢:٠٠…
--
--  ٢) ولا مهلةَ قبل أول موعد: في ١٦:٠١ كان يُعرض موعد ١٦:٣٠ — والعميل يحتاج
--     وقتًا ليصل، والمطعم ليجهّز. ربع ساعةٍ حدًّا أدنى.
--
--  ٣) وفرعٌ في الإنتاج (Eficto الثاني) مُفعَّلٌ عليه استقبال الحجوزات وليس فيه
--     طاولةٌ واحدة. حارس التطبيق يمنع الجديد، لكن القديم قائم — ولا يحرس
--     مسارًا آخر: مفتاح API، سكربت، لوحة الأدمن. الحارس مكانه القاعدة.
-- ============================================================================

-- ── ١) المواعيد: على الساعة، وبمهلةٍ قبل أوّلها ────────────────────────────
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
  v_local    timestamp;
  v_open     timestamptz;
  v_close    timestamptz;
  v_party    int := greatest(coalesce(p_party, 1), 1);
  v_zone     text := case when p_zone in ('inside','outside') then p_zone else null end;
  v_t        timestamptz;
  v_tbl      uuid;
  -- مهلة الوصول: لا نبيع موعدًا بعد دقائق — يحتاجها العميل ليصل والمطعم ليجهّز
  v_lead     interval := interval '15 minutes';
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

  -- وقت الفتح محلّيًّا، مُقرَّبًا لأعلى إلى نصف ساعةٍ كاملة. التقريب على
  -- timestamp مجرّد لا timestamptz: date_trunc على الثاني يتبع منطقة الجلسة،
  -- وهي على الخادم UTC — فكان التقريب ينزلق ثلاث ساعات.
  v_local := (p_day::text || ' ' || coalesce(v_hours->>'open', '12:00'))::timestamp;
  v_local := date_trunc('hour', v_local)
             + interval '30 minutes' * ceil(extract(minute from v_local) / 30.0);
  v_open  := v_local at time zone 'Asia/Riyadh';

  v_close := ((p_day::text || ' ' || coalesce(v_hours->>'close', '23:00'))::timestamp)
               at time zone 'Asia/Riyadh';
  -- الإغلاق بعد منتصف الليل يخصّ اليوم التالي
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

grant execute on function public.reservation_slots(uuid, date, integer, text) to anon, authenticated, service_role;

-- ── ٢) الحارس في القاعدة: لا حجوزات بلا طاولات ────────────────────────────
-- الحجز يخصّص طاولةً بعينها (pick_table_for). فرعٌ بلا طاولاتٍ يقبل حجوزات
-- لا تحجز شيئًا، ولا يعرف متى امتلأ. الواجهة تعطّل المفتاح، وهذا يمنع كل
-- مسارٍ آخر: سكربت، مفتاح API، لوحة الأدمن.
create or replace function public.enforce_reservations_need_tables()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.accepts_reservations
     and not exists (
       select 1 from public.tables t
       where t.branch_id = new.branch_id and t.is_active
     ) then
    new.accepts_reservations := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reservations_need_tables on public.branch_settings;
create trigger trg_reservations_need_tables
  before insert or update of accepts_reservations, branch_id on public.branch_settings
  for each row execute function public.enforce_reservations_need_tables();

-- والعكس: مالكٌ حذف آخر طاولةٍ في فرعٍ يستقبل حجوزات. الصمت هنا أسوأ —
-- الفرع يبقى معروضًا للعميل ويقبل ما لا يستطيع الوفاء به. يُطفأ الاستقبال،
-- والحجوزات القائمة تبقى كما هي (لها طاولاتها، ولا يحقّ لنا إلغاؤها).
create or replace function public.close_reservations_when_no_tables()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_branch uuid := coalesce(new.branch_id, old.branch_id);
begin
  if not exists (
    select 1 from public.tables t where t.branch_id = v_branch and t.is_active
  ) then
    update public.branch_settings
       set accepts_reservations = false
     where branch_id = v_branch and accepts_reservations;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_close_reservations_when_no_tables on public.tables;
create trigger trg_close_reservations_when_no_tables
  after delete or update of is_active, branch_id on public.tables
  for each row execute function public.close_reservations_when_no_tables();

-- ── ٣) تصحيح ما هو قائم ───────────────────────────────────────────────────
-- فرعٌ في الإنتاج كان يستقبل حجوزات وليس فيه طاولة. لا نكتفي بمنع الجديد.
update public.branch_settings bs
   set accepts_reservations = false
 where bs.accepts_reservations
   and not exists (
     select 1 from public.tables t
     where t.branch_id = bs.branch_id and t.is_active
   );
