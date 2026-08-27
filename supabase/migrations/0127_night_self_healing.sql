-- ═══ 0127: التعافي الذاتي الليلي — «يتصلح لحاله وأنا نايم» ═══
--
-- طلب المشغّل الحرفي: ألّا يبقى شيءٌ عالقًا أو معطّلًا بالليل بانتظار يدٍ
-- بشرية. جردُ ما يتعافى لحاله أصلًا (سيرفرلس بلا عمليات تموت، طابور
-- يُنظَّف كل ربع ساعة بسقف ٨ ساعات شامل، أعلام يدوية تُصفَّر فجرًا،
-- مهلات ٣/٨/٨ ثوانٍ على أدوار العميل والمالك والناقل) كشف ثلاث فجوات
-- تعليقٍ حقيقية تُغلق هنا:
--
-- ── (أ) مهلات الدور الوحيد المكشوف + قاتل الجلسات المعلّقة وقائيًّا ──
-- service_role (خادمنا) كان بلا statement_timeout إطلاقًا — استعلامٌ
-- واحدٌ معلّق منه يتراكم بالليل بلا قاتل. و«معاملة مفتوحة خاملة»
-- (idle in transaction) أخطر: تمسك أقفالًا ولا يمسّها statement_timeout
-- أصلًا — هي بالضبط ما يجعل «كل شيء واقف» صباحًا.
alter role service_role set statement_timeout = '15s';
alter role service_role set idle_in_transaction_session_timeout = '60s';
alter role authenticator set idle_in_transaction_session_timeout = '60s';

-- ── (ب) حارسٌ نشط يقتل ما أفلت من المهلات ──
-- حزامٌ فوق الأحزمة: كل دقيقتين يُنهي أي استعلامٍ نشطٍ تجاوز دقيقتين أو
-- معاملةٍ خاملةٍ مفتوحةٍ تجاوزت ثلاثًا — من أدوار التطبيق وحدها (postgres
-- والكرون والصيانة مستثنون فلا يقتل ترحيلًا مقصودًا). ويُبلّغ تيليجرام
-- «عولج ذاتيًّا» فقط حين يقتل شيئًا فعلًا — صفر إزعاج في الليالي السليمة.
create or replace function public.watchdog_kill_stuck()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  n int := 0;
  r record;
begin
  for r in
    select pid, usename, state,
           left(coalesce(query, ''), 120) as q
      from pg_stat_activity
     where pid <> pg_backend_pid()
       and usename in ('authenticator', 'anon', 'authenticated', 'service_role')
       and (
         (state = 'active' and query_start < now() - interval '2 minutes')
         or (state = 'idle in transaction' and state_change < now() - interval '3 minutes')
       )
  loop
    perform pg_terminate_backend(r.pid);
    n := n + 1;
  end loop;

  if n > 0 then
    perform public.notify_telegram(
      '🛠 دور — عولج ذاتيًّا: أُنهي ' || n || ' اتصال عالق بالقاعدة قبل أن يتراكم.' || E'\n' ||
      'الوقت: ' || to_char(now() at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI') || ' (بتوقيت الرياض)' || E'\n' ||
      'لا يلزمك فعل شيء — هذه الرسالة للعلم فقط، وتكرارها المتقارب وحده يستحق نظرة.');
  end if;
  return n;
end;
$fn$;

-- كأخواتها (درس 0120): تُقفل فور الولادة — المستدعي الشرعي كرون postgres.
revoke execute on function public.watchdog_kill_stuck() from public, anon, authenticated;

select cron.schedule('watchdog-stuck', '*/2 * * * *', 'select public.watchdog_kill_stuck()');

-- ── (ج) عامل الإرسال الخلفي يُعاد تشغيله ذاتيًّا عند التكدّس ──
-- كل رسائل البوت تمرّ من طابور pg_net؛ تكدّسُه كان «تنبيهًا» فقط (0125)
-- والآن صار علاجًا: إعادة تشغيل العامل قبل إطلاق التنبيه — فإن نجحت
-- وصلت رسالة 🔴 المتأخرة ثم ✅ التعافي في الدورة التالية، وإن فشلت
-- كشفها غيابُ نبضة الظهر (0125). التعديل محصورٌ في مقدمة الدالة؛
-- حلقة «عند التغيّر فقط» أدناه كما هي حرفيًّا من 0125.
create or replace function public.send_platform_alerts()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
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
    {"key":"net_queue","label":"طابور الإرسال الخلفي (تنبيهات البوت) متكدّس — أُعيد تشغيل العامل ذاتيًّا"}
  ]'::jsonb;
  c jsonb;
  v_ok boolean;
  v_prev boolean;
  v_msg text;
  v_req_id bigint;
begin
  select value into v_token from public.alert_config where key = 'telegram_bot_token';
  select value into v_chat_id from public.alert_config where key = 'telegram_chat_id';
  if v_token is null or v_chat_id is null then return; end if;

  v_health := public.check_platform_health();

  -- علاجٌ ذاتي قبل التنبيه: تكدّس طابور pg_net → أعد تشغيل عامله
  if (v_health -> 'net_queue' ->> 'ok')::boolean = false then
    begin
      perform net.worker_restart();
    exception when others then
      null; -- فشل الإنعاش لا يمنع محاولة التنبيه؛ غياب النبضة يكشف الباقي
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

      v_req_id := net.http_post(
        url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := jsonb_build_object('chat_id', v_chat_id, 'text', v_msg)
      );

      insert into public.alert_state (check_key, is_failing, last_changed_at, last_message)
      values (c->>'key', true, now(), v_msg)
      on conflict (check_key) do update set is_failing = true, last_changed_at = now(), last_message = excluded.last_message;

    elsif v_ok = true and v_prev = true then
      v_msg := '✅ دور — تعافى: ' || (c->>'label') || E'\n' ||
               'الوقت: ' || to_char(now() at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI') || ' (بتوقيت الرياض)';

      v_req_id := net.http_post(
        url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := jsonb_build_object('chat_id', v_chat_id, 'text', v_msg)
      );

      insert into public.alert_state (check_key, is_failing, last_changed_at, last_message)
      values (c->>'key', false, now(), v_msg)
      on conflict (check_key) do update set is_failing = false, last_changed_at = now(), last_message = excluded.last_message;
    end if;
  end loop;
end;
$fn$;
