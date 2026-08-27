-- ═══ 0125: نبضة يومية — «مفتاح الرجل الميت» لقناة التنبيه نفسها ═══
--
-- الفجوة (رقم ١١ في جرد الركائز الخمس عشرة، بطلب المشغّل الصريح بعد
-- تقدير ساعة التعطّل بـ٢٠ ألف ريال): send_platform_alerts ترسل عبر
-- net.http_post ولا تتحقّق أبدًا أن الرسالة وصلت — فلو انتهى توكن البوت
-- أو تغيّر chat_id، يصير نظام المراقبة كلُّه أعمى ولا أحد يدري أنه عمي.
-- والتنبيه على «قناة التنبيه معطّلة» عبر القناة المعطّلة نفسها مستحيل
-- منطقيًّا — الحل المعياري الوحيد: رسالة نبضٍ يومية بموعدٍ ثابت.
-- وصولها اليومي = القناة حيّة؛ غيابها يومًا = القناة نفسها انكسرت،
-- والمشغّل يكتشف ذلك خلال يومٍ لا خلال شهرٍ من العمى الصامت.
--
-- ومعها: فحص تكدّس net.http_request_queue — كل رسائل البوت تمرّ من هذا
-- الطابور الخلفي، وتكدّسه يعني تنبيهاتٍ متأخرة أو ضائعة وكلّ شيءٍ آخر
-- «يبدو» سليمًا. (لو مات عامل pg_net كليًّا فالتنبيه عليه لن يُرسَل
-- أصلًا — وهذا بالضبط ما تكشفه النبضة بغيابها.)

-- ── (أ) check_platform_health: مفتاح net_queue الجديد ──
create or replace function public.check_platform_health()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_resp public.http_response;
  v_home_status int; v_home_ok boolean; v_home_ms int; v_t0 timestamptz;
  v_restaurant_status int; v_restaurant_ok boolean; v_restaurant_ms int;
  v_cron_last timestamptz; v_cron_ok boolean;
  v_canary_branch uuid;
  v_pos int; v_eid uuid;
  v_cancel_ok boolean;
  v_booking_ok boolean;
  v_booking_error text;
  v_anon_key text;
  v_rest_status int;
  v_rest_ok boolean;
  v_rest_error text;
  v_long_query_count int;
  v_rls_missing int;
  v_rls_missing_tables text;
  v_funcs_broken int;
  v_funcs_broken_list text;
  v_canary_phone text;
  v_stuck_count int;
  v_stuck_branches text;
  v_flatline_count int;
  v_flatline_branches text;
  v_conn_count int;
  v_conn_max int;
  v_conn_ok boolean;
  v_net_queue int;
begin
  perform public.http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');

  begin
    v_t0 := clock_timestamp();
    select * into v_resp from public.http_get('https://ei8ht.app/');
    v_home_status := v_resp.status;
    v_home_ms := round(extract(epoch from (clock_timestamp() - v_t0)) * 1000);
    v_home_ok := v_home_status between 200 and 399 and v_home_ms < 4000;
  exception when others then
    v_home_ok := false; v_home_status := -2; v_home_ms := null;
  end;

  begin
    v_t0 := clock_timestamp();
    select * into v_resp from public.http_get('https://ei8ht.app/r/eficto');
    v_restaurant_status := v_resp.status;
    v_restaurant_ms := round(extract(epoch from (clock_timestamp() - v_t0)) * 1000);
    v_restaurant_ok := v_restaurant_status between 200 and 399 and v_restaurant_ms < 4000;
  exception when others then
    v_restaurant_ok := false; v_restaurant_status := -2; v_restaurant_ms := null;
  end;

  select value into v_anon_key from public.alert_config where key = 'supabase_anon_key';
  begin
    select * into v_resp from public.http((
      'GET', 'https://nkdfxmjuigslmangzuua.supabase.co/rest/v1/restaurants?select=id&limit=1',
      array[
        public.http_header('apikey', v_anon_key),
        public.http_header('Authorization', 'Bearer ' || v_anon_key)
      ], null, null
    )::public.http_request);
    v_rest_status := v_resp.status;
    v_rest_ok := (v_rest_status = 200);
    if not v_rest_ok then v_rest_error := left(v_resp.content, 300); end if;
  exception when others then
    v_rest_ok := false; v_rest_status := -2; v_rest_error := sqlerrm;
  end;

  select max(jrd.end_time) into v_cron_last
  from cron.job_run_details jrd
  join cron.job j on j.jobid = jrd.jobid
  where j.jobname = 'expire-stale' and jrd.status = 'succeeded';
  v_cron_ok := (v_cron_last is not null and v_cron_last > now() - interval '25 minutes');

  select b.id into v_canary_branch
  from public.branches b join public.restaurants r on r.id = b.restaurant_id
  where r.slug = 'system-canary-do-not-delete';

  v_canary_phone := '05' || lpad((extract(epoch from clock_timestamp())::bigint % 100000000)::text, 8, '0');

  begin
    select queue_pos, entry_id into v_pos, v_eid
    from public.join_waitlist_guest(v_canary_branch, 'فحص آلي', v_canary_phone, 1, 'inside');
    select public.cancel_by_ticket(v_eid) into v_cancel_ok;
    v_booking_ok := (v_eid is not null and v_cancel_ok);
    delete from public.waitlist_entries where id = v_eid;
  exception when others then
    v_booking_ok := false;
    v_booking_error := sqlerrm;
  end;

  select count(*) into v_long_query_count
  from pg_stat_activity
  where state = 'active' and now() - query_start > interval '30 seconds'
    and query not ilike '%pg_stat_activity%';

  select count(*), string_agg(c.relname, ', ')
    into v_rls_missing, v_rls_missing_tables
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

  select count(*), string_agg(missing.fname, ', ') into v_funcs_broken, v_funcs_broken_list
  from (
    select expected.fname
    from unnest(array['join_waitlist_guest','cancel_by_ticket','waitlist_ticket_status','tv_queue','set_staff_permission']) as expected(fname)
    left join pg_proc p on p.proname = expected.fname and p.pronamespace = 'public'::regnamespace
    where p.oid is null
       or not p.prosecdef
       or not exists (
         select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) cfg
         where cfg like 'search_path=%'
       )
  ) missing;

  select count(*), string_agg(distinct r.name, '، ')
    into v_stuck_count, v_stuck_branches
  from public.waitlist_entries w
  join public.branches b on b.id = w.branch_id and b.is_active
  join public.restaurants r on r.id = b.restaurant_id and r.is_active and not r.is_canary
  where w.status in ('waiting', 'notified')
    and w.joined_at < now() - interval '3 hours';

  with recent as (
    select w.branch_id,
      count(*) filter (where w.joined_at >= now() - interval '30 minutes') as last30,
      count(*) filter (where w.joined_at >= now() - interval '90 minutes'
                          and w.joined_at <  now() - interval '30 minutes') as prev60
    from public.waitlist_entries w
    join public.branches b on b.id = w.branch_id and b.is_active
    join public.restaurants r on r.id = b.restaurant_id and r.is_active and not r.is_canary
    where w.joined_at >= now() - interval '90 minutes'
    group by w.branch_id
  )
  select count(*), string_agg(r.name, '، ')
    into v_flatline_count, v_flatline_branches
  from recent rc
  join public.branches b on b.id = rc.branch_id
  join public.restaurants r on r.id = b.restaurant_id
  join public.branch_settings bs on bs.branch_id = rc.branch_id
  where rc.prev60 >= 3 and rc.last30 = 0
    and public.branch_open_by_hours(bs.opening_hours, now());

  select count(*) into v_conn_count from pg_stat_activity;
  v_conn_max := current_setting('max_connections')::int;
  v_conn_ok := v_conn_count < (v_conn_max * 0.8);

  -- طابور الإرسال الخلفي (pg_net) — منه تمرّ كل رسائل البوت
  select count(*) into v_net_queue from net.http_request_queue;

  return jsonb_build_object(
    'checked_at', now(),
    'homepage', jsonb_build_object('ok', v_home_ok, 'status', v_home_status, 'ms', v_home_ms),
    'restaurant_page', jsonb_build_object('ok', v_restaurant_ok, 'status', v_restaurant_status, 'ms', v_restaurant_ms),
    'anon_rest_api', jsonb_build_object('ok', v_rest_ok, 'status', v_rest_status, 'error', v_rest_error),
    'cron_expire_stale', jsonb_build_object('ok', v_cron_ok, 'last_success', v_cron_last),
    'booking_writepath', jsonb_build_object('ok', v_booking_ok, 'error', v_booking_error),
    'no_stuck_queries', jsonb_build_object('ok', v_long_query_count = 0, 'count', v_long_query_count),
    'schema_integrity', jsonb_build_object(
      'ok', (v_rls_missing = 0 and v_funcs_broken = 0),
      'tables_missing_rls', v_rls_missing_tables,
      'broken_critical_functions', v_funcs_broken_list
    ),
    'stuck_queue', jsonb_build_object('ok', v_stuck_count = 0, 'count', v_stuck_count, 'branches', v_stuck_branches),
    'join_flatline', jsonb_build_object('ok', v_flatline_count = 0, 'count', v_flatline_count, 'branches', v_flatline_branches),
    'db_connections', jsonb_build_object('ok', v_conn_ok, 'count', v_conn_count, 'max', v_conn_max),
    'net_queue', jsonb_build_object('ok', v_net_queue < 100, 'count', v_net_queue)
  );
end;
$fn$;

-- ── (ب) send_platform_alerts: توصيل مفتاح net_queue بحلقة التنبيه ──
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
    {"key":"net_queue","label":"طابور الإرسال الخلفي (تنبيهات البوت) متكدّس — الرسائل قد تتأخر"}
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

-- ── (ج) النبضة اليومية نفسها ──
-- ١٢ ظهرًا بتوقيت الرياض: المشغّل صاحٍ، والذروة المسائية لم تبدأ،
-- وإحصاءات أمس مجمّعة منذ منتصف الليل (rollup-daily يعمل ٠٠:١٠ رياض).
create or replace function public.run_daily_heartbeat()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_health jsonb;
  v_total int;
  v_fail int;
  v_fail_keys text;
  v_joined bigint;
  v_seated bigint;
  v_rest_count int;
  v_msg text;
begin
  v_health := public.check_platform_health();

  select count(*), count(*) filter (where (v ->> 'ok')::boolean = false),
         string_agg(k, '، ') filter (where (v ->> 'ok')::boolean = false)
    into v_total, v_fail, v_fail_keys
  from jsonb_each(v_health) as e(k, v)
  where k <> 'checked_at';

  select coalesce(sum(ds.joined_count), 0), coalesce(sum(ds.seated_count), 0),
         count(distinct b.restaurant_id) filter (where ds.joined_count > 0)
    into v_joined, v_seated, v_rest_count
  from public.daily_stats ds
  join public.branches b on b.id = ds.branch_id
  where ds.stat_date = (now() at time zone 'Asia/Riyadh')::date - 1;

  v_msg := '💚 دور — النبضة اليومية' || E'\n' ||
           'الوقت: ' || to_char(now() at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI') || ' (بتوقيت الرياض)' || E'\n' ||
           case when v_fail = 0
             then 'الحالة: كل الفحوص (' || v_total || ') خضراء ✓'
             else '⚠️ الحالة: ' || v_fail || ' من ' || v_total || ' فحوص حمراء: ' || v_fail_keys
           end || E'\n' ||
           'أمس: انضم ' || v_joined || ' للطوابير وخُدم ' || v_seated ||
             ' عبر ' || v_rest_count || ' مطعم.' || E'\n' ||
           'زمن فتح الرئيسية: ' || coalesce((v_health->'homepage'->>'ms'), '؟') || 'ms · اتصالات القاعدة: ' ||
             coalesce((v_health->'db_connections'->>'count'), '؟') || '/' ||
             coalesce((v_health->'db_connections'->>'max'), '؟') || E'\n' ||
           '(هذه الرسالة تصلك يوميًّا الساعة ١٢ ظهرًا — إن لم تصلك يومًا فقناة التنبيه نفسها معطّلة وتحتاج تفقّدًا فوريًّا)';

  perform public.notify_telegram(v_msg);
end;
$fn$;

-- كأخواتها (درس 0120): المنح الافتراضي مفتوحٌ للجميع — تُقفل فور الولادة.
-- المستدعي الشرعي الوحيد كرونُ postgres.
revoke execute on function public.run_daily_heartbeat() from public, anon, authenticated;

-- ٠٩:٠٠ UTC = ١٢:٠٠ ظهرًا بتوقيت الرياض (لا تحوّل صيفي في السعودية)
select cron.schedule('daily-heartbeat', '0 9 * * *', 'select public.run_daily_heartbeat()');
