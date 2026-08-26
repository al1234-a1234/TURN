-- ٠١٢١ — دوامٌ مختلف بحسب اليوم: opening_hours.days
--
-- طلبٌ صريح من المشغّل: «بعض المطاعم لها وقت ينفتح على حسب الأيام».
-- الشكل الموسّع (متوافقٌ خلفيًّا تمامًا — days اختياري واليوم الغائب يتبع
-- العامّ):
--   {"open":"16:00","close":"23:00","days":{"5":{"open":"14:00","close":"23:30"}}}
-- المفتاح يوم الأسبوع بتوقيت الرياض، 0=الأحد (extract(dow) في postgres
-- وgetDay في JS يتطابقان على هذا).
--
-- النطاق الليلي مع أيامٍ مختلفة له معنًى واحدٌ صحيح: بعد منتصف الليل
-- يُحسب ذيلُ دوامِ «أمس» بجدول أمس لا جدول اليوم — مطعمٌ يقفل الجمعة ٣
-- فجرًا يبقى مفتوحًا فجر السبت ولو كان دوام السبت نفسه يبدأ عصرًا.
--
-- الطرف الآخر (isWithinOpeningHours في src/lib/dates.ts) حُدِّث بنفس
-- المنطق حرفيًّا في نفس الالتزام.

create or replace function public.branch_open_by_hours(p_hours jsonb, p_now timestamp with time zone default now())
returns boolean
language plpgsql
stable
set search_path to ''
as $$
declare
  v_local timestamp; v_now time; v_dow int; v_ydow int;
  v_open time; v_close time; v_y_open time; v_y_close time;
begin
  if p_hours is null then return true; end if;
  v_local := p_now at time zone 'Asia/Riyadh';
  v_now := v_local::time;
  v_dow := extract(dow from v_local)::int;   -- 0=الأحد، يطابق getDay
  v_ydow := (v_dow + 6) % 7;

  v_open := coalesce(nullif(btrim(p_hours->'days'->(v_dow::text)->>'open'), ''),
                     nullif(btrim(p_hours->>'open'), ''))::time;
  v_close := coalesce(nullif(btrim(p_hours->'days'->(v_dow::text)->>'close'), ''),
                      nullif(btrim(p_hours->>'close'), ''))::time;

  -- يومٌ بلا دوامٍ مضبوط = مفتوح — لا نغلق فرعًا لم يضبط ساعاته أصلًا
  if v_open is null or v_close is null then return true; end if;
  if v_open = v_close then return true; end if;

  if (v_open < v_close and v_now >= v_open and v_now < v_close)
     or (v_open > v_close and v_now >= v_open) then
    return true;
  end if;

  -- ذيل نطاقٍ ليليٍّ بدأ أمس (يفتح مساءً ويقفل بعد منتصف الليل)
  v_y_open := coalesce(nullif(btrim(p_hours->'days'->(v_ydow::text)->>'open'), ''),
                       nullif(btrim(p_hours->>'open'), ''))::time;
  v_y_close := coalesce(nullif(btrim(p_hours->'days'->(v_ydow::text)->>'close'), ''),
                        nullif(btrim(p_hours->>'close'), ''))::time;
  return v_y_open is not null and v_y_close is not null
     and v_y_open > v_y_close and v_now < v_y_close;
exception when others then
  return true;   -- قيمة تالفة لا تُغلق مطعمًا — نفس عهد الدالة منذ إنشائها
end;
$$;

-- مواعيد الحجز تُولَّد من دوام اليوم المطلوب نفسه — كانت تقرأ open/close
-- العامّين وحدهما، فيوم الجمعة ذو الدوام المختلف كان يعرض مواعيد أيام
-- الأسبوع. p_day تاريخٌ محليٌّ بتوقيت الرياض أصلًا فيؤخذ dow منه مباشرة.
create or replace function public.reservation_slots(p_branch_id uuid, p_day date, p_party integer, p_zone text default null::text)
returns table(slot_at timestamp with time zone, table_id uuid)
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_hours jsonb; v_duration int; v_window int;
  v_local timestamp; v_open timestamptz; v_close timestamptz;
  v_party int := greatest(coalesce(p_party, 1), 1);
  v_asked text := nullif(btrim(p_zone), '');
  v_zone text := public.valid_branch_zone(p_branch_id, p_zone);
  v_t timestamptz; v_tbl uuid;
  v_lead interval := interval '15 minutes';
  v_dow text;
begin
  -- طُلب قسمٌ بعينه وليس من أقسام الفرع الفعّالة → لا مواعيد، لا بديل
  if v_asked is not null and v_zone is null then return; end if;

  select bs.opening_hours, coalesce(bs.default_duration_min, 90), coalesce(bs.booking_window_days, 30)
    into v_hours, v_duration, v_window
  from public.branch_settings bs where bs.branch_id = p_branch_id;

  if v_hours is null then return; end if;

  if p_day < (now() at time zone 'Asia/Riyadh')::date
     or p_day > ((now() at time zone 'Asia/Riyadh')::date + v_window) then
    return;
  end if;

  v_dow := extract(dow from p_day)::int::text;

  v_local := (p_day::text || ' ' || coalesce(
                nullif(btrim(v_hours->'days'->v_dow->>'open'), ''),
                nullif(btrim(v_hours->>'open'), ''), '12:00'))::timestamp;
  v_local := date_trunc('hour', v_local)
             + interval '30 minutes' * ceil(extract(minute from v_local) / 30.0);
  v_open  := v_local at time zone 'Asia/Riyadh';

  v_close := ((p_day::text || ' ' || coalesce(
                nullif(btrim(v_hours->'days'->v_dow->>'close'), ''),
                nullif(btrim(v_hours->>'close'), ''), '23:00'))::timestamp)
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
