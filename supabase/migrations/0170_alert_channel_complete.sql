-- ═══════════════════════════════════════════════════════════════
-- ٠١٧٠ — إكمال ٠١٦٣: كلّ مُرسِلٍ يمرّ بالقناة المُصلَّحة
-- ═══════════════════════════════════════════════════════════════
--
-- ── العطل ──
-- الترحيل ٠١٦٣ عالج حادثة ٣٠ أغسطس (مصافحة SSL التهمت ٤٫٨٥ ثانية من مهلةٍ
-- افتراضيّة قدرها ٥) فأصلح `notify_telegram` و`sweep_alert_outbox` وحدهما.
-- وبقيت أربعُ دوالّ تنادي `net.http_post` مباشرةً بلا مهلة:
--   send_platform_alerts · send_platform_status_digest
--   alert_visual_integrity · alert_closed_branch_with_waiters
-- و`net.http_post` توقيعها `timeout_milliseconds integer DEFAULT 5000`.
--
-- ── وليس احتمالًا: وقع مرّتين في ٢٤ ساعة ──
-- من `net._http_response` ليلة ٣١ أغسطس:
--   02:10  Timeout of 5000 ms reached … TCP/SSL handshake time: 4855.376 ms
--   02:55  Timeout of 5000 ms reached … TCP/SSL handshake time: 4975.649 ms
-- ٢ من ٨ نداءاتٍ ضاعا. ونصّ الخطأ يقول `5000 ms` بينما المسار المُصلَّح
-- يضبط `20000` — إذن المصدر إحدى الأربع قطعًا، لا الاثنتين المُصلَّحتين.
--
-- ── ولا أثر لهما ──
-- `send_platform_alerts` نُفِّذت ١٢٥٥ مرّة ولا تكتب في `alert_outbox` إطلاقًا،
-- والصندوق فيه صفٌّ واحدٌ منذ إنشائه. فقاعدة الميثاق §٤ — «كلّ إنذارٍ يترك
-- أثرًا مكتوبًا» — كانت مطبَّقةً على المسار اليدويّ ومعطَّلةً على المسار
-- الآليّ الذي يعمل كلّ خمس دقائق. وإنذارٌ لم يصل ولم يترك أثرًا هو أسوأ من
-- غياب الإنذار: يورث طمأنينةً كاذبة.
--
-- ── الإصلاح: لا تكرار المنطق، بل المرور بالقناة ──
-- كلّ مواضع النداء الخمسة تُرسل إلى نفس عنوان تلغرام بنفس الترويسة وبنفس
-- شكل الجسم. فبدل نسخ «مهلة ٢٠ + إعادة محاولة» أربع مرّاتٍ (وأربعُ نسخٍ
-- تعني أربعَ فرصٍ للانحراف لاحقًا)، تُستبدل كلّ منها بـ
-- `perform public.notify_telegram(<النصّ>)`، فترث الثلاثة دفعةً واحدة:
--   • مهلة ٢٠٠٠٠ms (في notify_telegram)
--   • صفٌّ في alert_outbox — الأثر المكتوب
--   • وإعادةُ محاولةٍ واحدةٍ للعابر فقط عبر sweep_alert_outbox (كرون كلّ دقيقة):
--     2xx ⇒ delivered · 4xx ⇒ failed بلا إعادة (رفضٌ منطقيّ: توكن/محادثة)
--     مهلة أو انقطاع أو 5xx أو لا استجابة خلال دقيقتين ⇒ إعادةٌ واحدة
--     (`attempts < 2`) ثم failed.
-- وهذا حرفيًّا شرط المالك: «مهلة ٢٠ ثانية + إعادة محاولة واحدة للفشل العابر
-- فقط، لا للمنطقيّ 4xx».
--
-- ── ما لم يتغيّر ──
-- أجسام الدوالّ الأربع منسوخةٌ حرفيًّا من تعريف الإنتاج الحيّ
-- (`pg_get_functiondef`) بما فيها التعليقات و`search_path` و`SECURITY DEFINER`.
-- التعديل الوحيد في كلٍّ منها هو سطر الإرسال. ولا منطقَ فحصٍ مُسّ، ولا عتبة
-- أُرخيت، ولا شرطُ إنذارٍ خُفِّف.

begin;

-- ═══ ١) send_platform_alerts — موضعا إرسال: الإنذار والتعافي ═══
create or replace function public.send_platform_alerts()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_health jsonb;
  v_token text;
  v_chat_id text;
  v_checks jsonb := '[
    {"key":"homepage","label":"الصفحة الرئيسية ما تفتح أو بطيئة جدًّا"},
    {"key":"restaurant_page","label":"صفحة المطعم (r/eficto) ما تفتح أو بطيئة جدًّا"},
    {"key":"anon_rest_api","label":"واجهة القراءة العامة (anon) معطّلة"},
    {"key":"cron_expire_stale","label":"مهمة تنظيف الطابور المجدولة متوقفة"},
    {"key":"booking_writepath","label":"وظيفة الحجز نفسها معطّلة"},
    {"key":"no_stuck_queries","label":"فيه استعلامات عالقة بالقاعدة أكثر من ٣٠ ثانية"},
    {"key":"schema_integrity","label":"⚠️ تغيّر بنيوي خطير: جدول فقد حماية RLS أو دالة حرجة انكسرت"},
    {"key":"stuck_queue","label":"⚠️ عميلٌ ينتظر بالطابور أكثر من ٣ ساعات — تفقّد المطعم فورًا"},
    {"key":"join_flatline","label":"⚠️ توقّف مفاجئ في انضمام العملاء بفرعٍ مفتوح ونشِط — يُحتمل انكسار رابط الانضمام"},
    {"key":"db_connections","label":"اتصالات القاعدة قريبة من الحد الأقصى"},
    {"key":"net_queue","label":"طابور الإرسال الخلفي (تنبيهات البوت) متكدّس — أُعيد تشغيل العامل ذاتيًّا"},
    {"key":"client_errors","label":"⚠️ أخطاء متكررة عند العملاء في المتصفح — شيء مكسور بالواجهة رغم سلامة الخادم"}
  ]'::jsonb;
  c jsonb;
  v_ok boolean;
  v_prev boolean;
  v_msg text;
begin
  select value into v_token from public.alert_config where key = 'telegram_bot_token';
  select value into v_chat_id from public.alert_config where key = 'telegram_chat_id';
  if v_token is null or v_chat_id is null then return; end if;

  v_health := public.check_platform_health();

  if (v_health -> 'net_queue' ->> 'ok')::boolean = false then
    begin
      perform net.worker_restart();
    exception when others then
      null;
    end;
  end if;

  for c in select * from jsonb_array_elements(v_checks) loop
    v_ok := (v_health -> (c->>'key') ->> 'ok')::boolean;

    select is_failing into v_prev from public.alert_state where check_key = (c->>'key');
    if v_prev is null then v_prev := false; end if;

    if v_ok = false and v_prev = false then
      v_msg := '🔴 دور — تنبيه: ' || (c->>'label') || E'\n' ||
               'الوقت: ' || to_char(now() at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI') || ' (بتوقيت الرياض)' || E'\n' ||
               'التفاصيل: ' || (v_health -> (c->>'key'))::text;

      perform public.notify_telegram(v_msg);

      insert into public.alert_state (check_key, is_failing, last_changed_at, last_message)
      values (c->>'key', true, now(), v_msg)
      on conflict (check_key) do update set is_failing = true, last_changed_at = now(), last_message = excluded.last_message;

    elsif v_ok = true and v_prev = true then
      v_msg := '✅ دور — تعافى: ' || (c->>'label') || E'\n' ||
               'الوقت: ' || to_char(now() at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI') || ' (بتوقيت الرياض)';

      perform public.notify_telegram(v_msg);

      insert into public.alert_state (check_key, is_failing, last_changed_at, last_message)
      values (c->>'key', false, now(), v_msg)
      on conflict (check_key) do update set is_failing = false, last_changed_at = now(), last_message = excluded.last_message;
    end if;
  end loop;
end;
$function$;

-- ═══ ٢) send_platform_status_digest — الملخّص المجدول ═══
create or replace function public.send_platform_status_digest(p_full boolean DEFAULT false)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_health jsonb;
  v_token text;
  v_chat_id text;
  v_msg text;
  v_total int;
  v_failed int;
  v_fail_names text;
begin
  select value into v_token from public.alert_config where key = 'telegram_bot_token';
  select value into v_chat_id from public.alert_config where key = 'telegram_chat_id';
  if v_token is null or v_chat_id is null then return; end if;

  v_health := public.check_platform_health();

  v_msg := '📊 دور — الحالة الآن' || E'\n' ||
           'الوقت: ' || to_char(now() at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI') || E'\n' ||
           'الصفحة الرئيسية: ' || coalesce((v_health->'homepage'->>'ms'),'؟') || 'ملي‌ثانية' ||
             (case when (v_health->'homepage'->>'ok')::boolean is not true then ' ⚠️' else ' ✓' end) || E'\n' ||
           'صفحة المطعم: ' || coalesce((v_health->'restaurant_page'->>'ms'),'؟') || 'ملي‌ثانية' ||
             (case when (v_health->'restaurant_page'->>'ok')::boolean is not true then ' ⚠️' else ' ✓' end) || E'\n' ||
           'اتصالات القاعدة: ' || coalesce((v_health->'db_connections'->>'count'),'؟') || '/' || coalesce((v_health->'db_connections'->>'max'),'؟') || E'\n' ||
           'أخطاء متصفح آخر ١٥ دقيقة: ' || coalesce((v_health->'client_errors'->>'count_15min'),'٠');

  if (v_health->'stuck_queue'->>'ok')::boolean is false then
    v_msg := v_msg || E'\n' || '⚠️ عميلٌ عالق بالطابور أكثر من ٣ ساعات: ' || coalesce(v_health->'stuck_queue'->>'branches','');
  end if;
  if (v_health->'join_flatline'->>'ok')::boolean is false then
    v_msg := v_msg || E'\n' || 'ℹ️ لا انضمامات جديدة مؤخرًا بفرعٍ نشط: ' || coalesce(v_health->'join_flatline'->>'branches','');
  end if;

  if p_full then
    select count(*), count(*) filter (where not pass) into v_total, v_failed
    from public.run_critical_checks();

    select string_agg(name, '، ') into v_fail_names
    from public.run_critical_checks() where not pass;

    v_msg := v_msg || E'\n\n' || '🧪 شبكة الفحوص الحرجة: ' || (v_total - v_failed) || '/' || v_total || ' ناجح';
    if v_failed > 0 then
      v_msg := v_msg || E'\n' || '🔴 فشل: ' || v_fail_names;
    else
      v_msg := v_msg || ' ✓';
    end if;
  end if;

  perform public.notify_telegram(v_msg);
end;
$function$;

-- ═══ ٣) alert_visual_integrity — الصفحة تُحمَّل لكنها مكسورة بصريًّا ═══
create or replace function public.alert_visual_integrity()
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v jsonb;
  v_tok text; v_chat text;
begin
  v := public.check_visual_integrity();
  if coalesce((v->>'ok')::boolean, false) then
    return;
  end if;

  select value into v_tok  from public.alert_config where key='telegram_bot_token';
  select value into v_chat from public.alert_config where key='telegram_chat_id';
  if v_tok is null or v_chat is null then return; end if;

  perform public.notify_telegram(
      '🔴 دور — الصفحة تُحمَّل لكنها مكسورة بصريًّا' || E'\n\n' ||
      'ملف التنسيق الذي تشير إليه الرئيسيّة لا يصل سليمًا.' || E'\n' ||
      'الرابط: ' || coalesce(v->>'href','—') || E'\n' ||
      'الحالة: ' || coalesce(v->>'css_status','—') ||
      ' · الحجم: ' || coalesce(v->>'css_bytes','—') || ' بايت' || E'\n' ||
      'السبب: ' || coalesce(v->>'reason', v->>'stage', '—') || E'\n\n' ||
      'العميل يرى نصًّا خامًّا وروابط زرقاء. البيانات سليمة والشكل مفقود.');
end;
$function$;

-- ═══ ٤) alert_closed_branch_with_waiters — فرعٌ مقفلٌ وفيه منتظرون ═══
create or replace function public.alert_closed_branch_with_waiters()
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  r record;
  v_tok text; v_chat text; v_key text; v_failing boolean;
begin
  select value into v_tok  from public.alert_config where key='telegram_bot_token';
  select value into v_chat from public.alert_config where key='telegram_chat_id';

  for r in
    select b.id as branch_id, rst.name as rest, b.name as br,
           count(w.id) as واقفون,
           coalesce(s.manually_closed,false) as يدويّ,
           round(extract(epoch from (now() - min(w.joined_at)))/60) as أقدم_دقيقة
      from public.branches b
      join public.restaurants rst on rst.id = b.restaurant_id
      join public.branch_settings s on s.branch_id = b.id
      join public.waitlist_entries w
        on w.branch_id = b.id and w.status in ('waiting','notified')
     where b.is_active and not rst.is_canary
       and ( coalesce(s.manually_closed,false)
             or (s.opening_hours is not null
                 and not public.branch_open_by_hours(s.opening_hours)) )
     group by b.id, rst.name, b.name, s.manually_closed
  loop
    v_key := 'closed_waiters:' || r.branch_id::text;
    select is_failing into v_failing from public.alert_state where check_key = v_key;

    if coalesce(v_failing,false) then
      continue;   -- نُبّه سابقًا — لا تكرار
    end if;

    insert into public.alert_state(check_key, is_failing, last_changed_at, last_message)
    values (v_key, true, now(),
            format('فرع مقفل وفيه %s منتظرًا', r.واقفون))
    on conflict (check_key) do update
       set is_failing = true, last_changed_at = now(),
           last_message = excluded.last_message;

    if v_tok is not null and v_chat is not null then
      perform public.notify_telegram(
          '⏳ دور — فرع مقفل وفيه منتظرون' || E'\n\n' ||
          r.rest || ' · ' || r.br || E'\n' ||
          'المقفَل: ' || case when r.يدويّ then 'يدويًّا' else 'حسب ساعات الدوام' end || E'\n' ||
          'في الطابور: ' || r.واقفون || ' — أقدمهم منذ ' || r.أقدم_دقيقة || ' دقيقة' || E'\n\n' ||
          'أمامك ٩٠ دقيقة من لحظة الإغلاق لإجلاسهم، ثم تُشطب تذاكرهم تلقائيًّا.' || E'\n' ||
          'لإفراغ الطابور الآن: زرّ «إفراغ الطابور» في لوحة الاستقبال.' || E'\n' ||
          'لإعادة الفتح: أرسل «افتح ' || r.rest || '».');
    end if;
  end loop;

  -- إعادة الضبط لمن لم يعد مقفلًا أو لم يبقَ فيه أحد
  update public.alert_state a
     set is_failing = false, last_changed_at = now()
   where a.check_key like 'closed_waiters:%' and a.is_failing
     and not exists (
       select 1 from public.branches b
       join public.branch_settings s on s.branch_id = b.id
       join public.waitlist_entries w on w.branch_id = b.id and w.status in ('waiting','notified')
      where 'closed_waiters:' || b.id::text = a.check_key
        and ( coalesce(s.manually_closed,false)
              or (s.opening_hours is not null
                  and not public.branch_open_by_hours(s.opening_hours)) )
     );
end;
$function$;

-- ═══ ٥) فحصٌ دائم — الميثاق §٤ يوجبه، ولولاه لتكرّر الانحراف ═══
--
-- ٠١٦٣ أصلح دالّتين وترك أربعًا، ولم يكن ثمّة فحصٌ يكشف ذلك — فبقي العطل
-- خمسة أيّامٍ حتّى ظهر في تدقيق. هذا الفحص يجعل الانحراف مستحيلًا صامتًا:
-- أيّ دالّةٍ تنادي `http_post` بلا `timeout_milliseconds` تُسقطه فورًا.
do $mig$
declare d text; d2 text;
begin
  select pg_get_functiondef(p.oid) into d
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'run_critical_checks';
  if d is null then raise exception 'run_critical_checks غير موجودة'; end if;

  d2 := replace(
    d,
    $srch$''\)::date'))
  )
  select name, pass from checks;$srch$,
    $repl$''\)::date')),
    ('w46_no_unbounded_http_post', not exists (
        select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.prokind='f'
           and p.prosrc like '%http_post%'
           and p.prosrc not like '%timeout_milliseconds%'))
  )
  select name, pass from checks;$repl$);

  if d2 = d then
    raise exception 'المرساة لم تُطابق — لم يتغيّر التعريف. توقّف قبل أن أكسر الفحص.';
  end if;
  execute d2;
end
$mig$;

commit;

-- المتوقَّع بعد التطبيق:
--   • ٢٠٩/٢٠٩ خضراء (٢٠٨ + w46).
--   • w46_no_unbounded_http_post = pass — ولا يمرّ إلا بعد إصلاح الأربع.
--   • كلّ إنذارٍ يصير له صفٌّ في alert_outbox، ويتولّى sweep_alert_outbox
--     إعادةَ المحاولة الواحدة للعابر وحده.
