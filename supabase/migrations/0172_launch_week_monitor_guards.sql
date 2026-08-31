-- 0172 — حارسا المراقبة الحيّة ليوم الإطلاق
--
-- ⚠️ **مؤقّتان، يُزالان بعد استقرار الأسبوع الأول.** ⚠️
--
-- ليسا جزءًا من شبكة الفحوص الدائمة ولا من عقد النظام. غرضهما تضييق نافذة
-- «العطل الصامت» في الأيام الأولى: أن نعرف من تلقاء أنفسنا، لا من شكوى ضيف.
-- خطّة الإزالة في ذيل هذا الملفّ — وهي جزءٌ من الالتزام لا ملحقٌ به.
--
-- لماذا حارسان فقط: حارس أخطاء Vercel أُسقط بقرار المالك («تعقيدٌ زائد
-- الآن») — ولأنّ القاعدة لا ترى أخطاء الخادم أصلًا: `client_errors` وحده
-- عندنا، وهو أخطاء المتصفّح لا الخادم.
--
-- كلاهما يمرّ بـ`notify_telegram` (مهلة ٢٠ث + أثرٌ مكتوب في `alert_outbox`)
-- لا بـ`net.http_post` المباشر — وهذا شرط الحارس w46 منذ ٠١٧٠.
-- وكلاهما محفّزٌ على الحافة عبر `alert_state`: يُنبّه مرّةً عند الانتقال إلى
-- العطل، ويصمت حتى يزول ثم يعود. لا تكرار كل خمس دقائق.

begin;

-- ═══════════════════════════════════════════════════════════════════
-- الحارس ١: تكرار الترتيب (position) في الطابور الحيّ
-- ═══════════════════════════════════════════════════════════════════
-- القيد `waitlist_live_pos_unique` (EXCLUDE ... DEFERRABLE) يمنع هذا
-- أصلًا. فلماذا حارس؟ لأنّ ٠١٦٩ لمس `set_waitlist_position` مباشرةً،
-- ولأنّ القيد المؤجَّل يُفحص عند الالتزام لا عند السطر — ولأنّ القيد نفسه
-- قد يُسقَط سهوًا في ترحيلٍ لاحق فيصمت الحقل كلّه.
-- فالحارس يراقب أمرين: التكرار الفعليّ، **وغياب القيد ذاته**.

create or replace function public.alert_position_duplicates()
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  r record;
  v_tok text; v_chat text; v_key text; v_failing boolean;
  v_constraint_ok boolean;
begin
  select value into v_tok  from public.alert_config where key='telegram_bot_token';
  select value into v_chat from public.alert_config where key='telegram_chat_id';

  -- (أ) التكرار الفعليّ: صفّان حيّان يتقاسمان (فرع، قسم، ترتيب)
  for r in
    select w.branch_id, rst.name as rest, b.name as br,
           w.zone, w.position, count(*) as كم
      from public.waitlist_entries w
      join public.branches b      on b.id = w.branch_id
      join public.restaurants rst on rst.id = b.restaurant_id
     where w.status in ('waiting','notified')
       and w.position is not null
       and not rst.is_canary
     group by w.branch_id, rst.name, b.name, w.zone, w.position
    having count(*) > 1
  loop
    v_key := 'pos_dup:' || r.branch_id::text;
    select is_failing into v_failing from public.alert_state where check_key = v_key;
    if coalesce(v_failing,false) then continue; end if;

    insert into public.alert_state(check_key, is_failing, last_changed_at, last_message)
    values (v_key, true, now(),
            format('تكرار ترتيب: %s/%s ترتيب %s ×%s', r.br, r.zone, r.position, r.كم))
    on conflict (check_key) do update
       set is_failing = true, last_changed_at = now(),
           last_message = excluded.last_message;

    if v_tok is not null and v_chat is not null then
      perform public.notify_telegram(
          '🔴 دور — تكرار ترتيبٍ في الطابور' || E'\n\n' ||
          r.rest || ' · ' || r.br || E'\n' ||
          'القسم: ' || r.zone || ' · الترتيب: ' || r.position ||
          ' — عليه ' || r.كم || ' ضيوف' || E'\n\n' ||
          'ضيفان يحملان الرقم نفسه. افتح لوحة الاستقبال وأعد ترتيب القسم يدويًّا.' || E'\n' ||
          'وهذا يعني أنّ قيد التفرّد لم يمنعه — أبلغ المطوّر فورًا.');
    end if;
  end loop;

  -- إعادة الضبط لمن زال عنه التكرار
  update public.alert_state a
     set is_failing = false, last_changed_at = now()
   where a.check_key like 'pos_dup:%'
     and a.check_key <> 'pos_dup:constraint'
     and a.is_failing
     and not exists (
       select 1 from public.waitlist_entries w
        where 'pos_dup:' || w.branch_id::text = a.check_key
          and w.status in ('waiting','notified')
          and w.position is not null
        group by w.branch_id, w.zone, w.position
       having count(*) > 1
     );

  -- (ب) القيد نفسه: موجودٌ وصالح؟ غيابه أخطر من تكرارٍ واحد، لأنه يُعمي الحقل.
  select exists (
    select 1 from pg_constraint c
     where c.conname = 'waitlist_live_pos_unique'
       and c.conrelid = 'public.waitlist_entries'::regclass
       and c.convalidated
  ) into v_constraint_ok;

  v_key := 'pos_dup:constraint';
  select is_failing into v_failing from public.alert_state where check_key = v_key;

  if not v_constraint_ok and not coalesce(v_failing,false) then
    insert into public.alert_state(check_key, is_failing, last_changed_at, last_message)
    values (v_key, true, now(), 'قيد waitlist_live_pos_unique غائبٌ أو غير صالح')
    on conflict (check_key) do update
       set is_failing = true, last_changed_at = now(),
           last_message = excluded.last_message;

    if v_tok is not null and v_chat is not null then
      perform public.notify_telegram(
          '🔴 دور — قيد تفرّد الترتيب غائب' || E'\n\n' ||
          'القيد waitlist_live_pos_unique غير موجودٍ أو غير صالح على ' ||
          'waitlist_entries.' || E'\n\n' ||
          'الطابور الآن بلا حمايةٍ من تكرار الأرقام. أبلغ المطوّر فورًا.');
    end if;
  elsif v_constraint_ok and coalesce(v_failing,false) then
    update public.alert_state
       set is_failing = false, last_changed_at = now()
     where check_key = v_key;
  end if;
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════
-- الحارس ٢: توقّف الانضمام في ساعة الذروة
-- ═══════════════════════════════════════════════════════════════════
-- العطل الذي نخشاه ليس الانهيار — الانهيار يُرى. بل أن تبقى الصفحة تعمل
-- والزرّ يُضغط ولا يُسجَّل أحد. عندها كل شيءٍ «أخضر» والمطعم فارغٌ بلا سبب.
--
-- القاعدة: فرعٌ مفتوحٌ فعليًّا ويقبل الطابور، **وكان يستقبل انضمامًا اليوم**،
-- ثمّ مرّت ٦٠ دقيقةً بلا انضمامةٍ واحدة داخل نافذة الذروة ⇒ نبّه.
--
-- شرط «كان يستقبل اليوم» مقصودٌ ويمنع الإنذار الكاذب الأشيع: فرعٌ هادئٌ
-- أصلًا أو حديث الإنشاء. نحن نصطاد **التوقّف** لا **الهدوء**.
--
-- النافذة ١٨:٠٠–٢٢:٥٩ بتوقيت الرياض: اختيارٌ ثابتٌ ومقصود. لا نشتقّه من
-- `branch_busy_hours` لأنّ تلك تُبنى من تاريخٍ لا نملكه بعد في الأسبوع
-- الأول — وحارسٌ يعتمد على تاريخٍ فارغ لا ينطق أبدًا.
-- و«اليوم» هنا ٨ ساعاتٍ متدحرجة لا `::date` — قاعدة اليوم التشغيليّ (٠١٦٥).

create or replace function public.alert_peak_join_stall()
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  r record;
  v_tok text; v_chat text; v_key text; v_failing boolean;
  v_hour int;
begin
  select value into v_tok  from public.alert_config where key='telegram_bot_token';
  select value into v_chat from public.alert_config where key='telegram_chat_id';

  v_hour := extract(hour from (now() at time zone 'Asia/Riyadh'))::int;

  for r in
    select b.id as branch_id, rst.name as rest, b.name as br,
           (select count(*) from public.waitlist_entries w
             where w.branch_id = b.id and w.joined_at > now() - interval '8 hours') as اليوم,
           (select round(extract(epoch from (now() - max(w.joined_at)))/60)
              from public.waitlist_entries w
             where w.branch_id = b.id) as منذ_دقيقة
      from public.branches b
      join public.restaurants rst   on rst.id = b.restaurant_id
      join public.branch_settings s on s.branch_id = b.id
     where b.is_active
       and not rst.is_canary
       and s.accepts_waitlist is not false
       and not coalesce(s.manually_closed, false)
       and not coalesce(s.queue_paused,   false)
       and not coalesce(s.join_frozen,    false)
       and s.opening_hours is not null
       and public.branch_open_by_hours(s.opening_hours)
       -- كان يستقبل اليوم…
       and exists (select 1 from public.waitlist_entries w
                    where w.branch_id = b.id
                      and w.joined_at > now() - interval '8 hours')
       -- …ثمّ صمت ٦٠ دقيقة
       and not exists (select 1 from public.waitlist_entries w
                        where w.branch_id = b.id
                          and w.joined_at > now() - interval '60 minutes')
  loop
    v_key := 'join_stall:' || r.branch_id::text;
    select is_failing into v_failing from public.alert_state where check_key = v_key;

    -- خارج نافذة الذروة نصمت، لكن لا نُعيد الضبط هنا: الضبط عند وصول
    -- انضمامةٍ فعلًا (أسفل)، وإلا لصار الحارس يُنبّه كل ليلةٍ عند ١٨:٠٠.
    if v_hour < 18 or v_hour > 22 then continue; end if;
    if coalesce(v_failing,false) then continue; end if;

    insert into public.alert_state(check_key, is_failing, last_changed_at, last_message)
    values (v_key, true, now(),
            format('توقّف الانضمام: %s — لا انضمامة منذ %s دقيقة', r.br, r.منذ_دقيقة))
    on conflict (check_key) do update
       set is_failing = true, last_changed_at = now(),
           last_message = excluded.last_message;

    if v_tok is not null and v_chat is not null then
      perform public.notify_telegram(
          '🟡 دور — توقّف الانضمام في وقت الذروة' || E'\n\n' ||
          r.rest || ' · ' || r.br || E'\n' ||
          'الفرع مفتوحٌ ويقبل الطابور، ودخله اليوم ' || r.اليوم || ' ضيفًا،' || E'\n' ||
          'لكن لا انضمامة منذ ' || coalesce(r.منذ_دقيقة::text,'—') || ' دقيقة.' || E'\n\n' ||
          'قد يكون هدوءًا حقيقيًّا — وقد يكون الانضمام معطّلًا صامتًا.' || E'\n' ||
          'افتح ei8ht.app/r/<الفرع> من جوّالك وجرّب أخذ دورٍ بنفسك.');
    end if;
  end loop;

  -- إعادة الضبط: وصلت انضمامةٌ خلال آخر ٦٠ دقيقة ⇒ الحقل يعمل.
  update public.alert_state a
     set is_failing = false, last_changed_at = now()
   where a.check_key like 'join_stall:%' and a.is_failing
     and exists (
       select 1 from public.waitlist_entries w
        where 'join_stall:' || w.branch_id::text = a.check_key
          and w.joined_at > now() - interval '60 minutes'
     );
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════
-- الجدولة
-- ═══════════════════════════════════════════════════════════════════
-- تكرار الترتيب: كل ٥ دقائق — عطلٌ حادّ يُرى فورًا، وثمنه استعلامٌ رخيص.
-- توقّف الانضمام: كل ١٥ دقيقة — نافذته ٦٠ دقيقة أصلًا، فلا معنى لأسرع.

select cron.unschedule('position-duplicates')
 where exists (select 1 from cron.job where jobname='position-duplicates');
select cron.schedule('position-duplicates', '*/5 * * * *',
                     'select public.alert_position_duplicates()');

select cron.unschedule('peak-join-stall')
 where exists (select 1 from cron.job where jobname='peak-join-stall');
select cron.schedule('peak-join-stall', '*/15 * * * *',
                     'select public.alert_peak_join_stall()');

-- ═══════════════════════════════════════════════════════════════════
-- مرجع q20: دالّتان جديدتان ⇒ ١٤٩ → ١٥١
-- ═══════════════════════════════════════════════════════════════════
-- تحديثُ مرجعٍ مقصود (CHARTER §2-٥) لا إسكاتُ فحص: البنية تغيّرت فعلًا،
-- والعدّاد يصف البنية. الجداول والسياسات والمفاتيح لم تتغيّر.
-- وعند الإزالة بعد الأسبوع الأول يعود العدّاد إلى ١٤٩ — انظر أدناه.

do $r$
declare d text; d2 text;
begin
  select pg_get_functiondef(oid) into d
    from pg_proc where proname='run_critical_checks' and pronamespace='public'::regnamespace;

  d2 := replace(d, 'p.prokind=''f'') = 149', 'p.prokind=''f'') = 151');
  if d2 = d then
    raise exception 'لم أجد عدّاد الدوالّ ١٤٩ في run_critical_checks — توقّف';
  end if;
  execute d2;
end $r$;

commit;

-- ═══════════════════════════════════════════════════════════════════
-- خطّة الإزالة — تُنفَّذ بعد استقرار الأسبوع الأول
-- ═══════════════════════════════════════════════════════════════════
-- ليست اقتراحًا: الحارسان مؤقّتان بالتصميم، وبقاؤهما بلا مراجعةٍ يحوّلهما
-- إلى ضجيجٍ يُتجاهَل — وهو أسوأ من غيابهما.
--
--   begin;
--   select cron.unschedule('position-duplicates');
--   select cron.unschedule('peak-join-stall');
--   drop function if exists public.alert_position_duplicates();
--   drop function if exists public.alert_peak_join_stall();
--   delete from public.alert_state
--    where check_key like 'pos_dup:%' or check_key like 'join_stall:%';
--   -- وأعِد عدّاد q20: ١٥١ → ١٤٩
--   do $r$
--   declare d text; d2 text;
--   begin
--     select pg_get_functiondef(oid) into d from pg_proc
--      where proname='run_critical_checks' and pronamespace='public'::regnamespace;
--     d2 := replace(d, 'p.prokind=''f'') = 151', 'p.prokind=''f'') = 149');
--     if d2 = d then raise exception 'لم أجد ١٥١ — توقّف'; end if;
--     execute d2;
--   end $r$;
--   commit;
