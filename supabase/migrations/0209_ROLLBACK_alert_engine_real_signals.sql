-- ============================================================================
--  تراجع ٠٢٠٨ — إعادة محرّك التنبيه إلى ما كان.
--
--  مكتوبٌ قبل الترحيل ومُختبَرٌ لا مفترَض. ونصُّ `send_platform_alerts`
--  أدناه منسوخٌ حرفيًّا من الإنتاج قبل ٠٢٠٨ لا من الذاكرة.
--
--  وأثرُه: تعود الرسائل الاثنتا عشرة القديمة بإرسالها الحافّيّ من أوّل نبضة
--  فاشلة — أي ٢٨ رسالة تقلّب في ٣٦ ساعة كما قِيس. وهو السلوك السابق لا
--  انحدارٌ جديد.
-- ============================================================================

-- الحارس أوّلًا: بقاؤه بعد عودة المحرّك القديم يعني فحصًا أحمر دائمًا.
do $mig$
declare v_def text; v_before text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='run_critical_checks';
  if v_def is null then raise exception 'run_critical_checks غير موجودة'; end if;

  v_before := v_def;
  v_def := replace(v_def,
      E'    (\'w31_alerts_read_real_signals\', (select pg_get_functiondef(oid) like \'%collect_alert_signals%\'\n'
   || E'                                        from pg_proc where proname=\'send_platform_alerts\')),\n'
   || E'    (\'w30_no_permission_drift\',',
      E'    (\'w30_no_permission_drift\',');

  v_def := replace(v_def, E'and p.prokind=\'f\') = 146', E'and p.prokind=\'f\') = 145');

  if v_def = v_before then
    raise exception 'لم يُطابَق مرتكز w31 ولا عدّاد ١٤٦ — راجع الحالة قبل المتابعة';
  end if;

  execute v_def;
end
$mig$;

-- المحرّك القديم حرفيًّا كما كان قبل ٠٢٠٨.
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

drop function if exists public.collect_alert_signals();

alter table public.alert_state drop column if exists fail_streak;
alter table public.alert_state drop column if exists last_scope;

-- وحالات المفاتيح الجديدة تُمسح: لا معنى لبقاء صفٍّ لفحصٍ لم يعد موجودًا.
delete from public.alert_state
 where check_key in ('real_page_errors','real_join_failures',
                     'stuck_db_query','permission_drift');
