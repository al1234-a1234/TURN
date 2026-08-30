-- ============================================================================
--  قناة تنبيه المالك تفشل صامتةً — وهي القناة التي يعرف بها أنّ شيئًا فشل.
--
--  ── الحادثة الفعليّة (٣٠ أغسطس، الإنتاج) ──
--  أرسلتُ رسالة ملخّصٍ عبر net.http_post فلم تصل. السبب مكتوبٌ حرفيًّا في
--  net._http_response للطلب ٨٦:
--    «Timeout of 5000 ms reached. Total time: 5001.44 ms
--      (DNS time: 155.11 ms, TCP/SSL handshake time: 4846.32 ms,
--       HTTP Request/Response time: 0.00 ms)»
--  أي أنّ مصافحة SSL وحدها التهمت ٤٫٨٥ ثانية من مهلةٍ افتراضيّة قدرها ٥،
--  فمات الطلب قبل أن يُرسل بايتًا واحدًا من الرسالة. أعدتُ الإرسال بمهلة
--  ٢٠ ثانية فوصل فورًا (الطلب ٨٧، status_code=200).
--
--  ولم يكن أحدٌ ليعلم. `notify_telegram` تُطلق الطلب وتنسى: لا تنتظر نتيجةً،
--  ولا تُعيد المحاولة، ولا تكتب أثرًا. فالرسالة الضائعة لا تترك خلفها شيئًا —
--  وكلّ نظام الإنذار في «دور» مبنيٌّ على أنّ هذه القناة تعمل. إنذارٌ لم يصل
--  أسوأ من غياب الإنذار: الأوّل يورث طمأنينةً كاذبة.
--
--  ── الإصلاح: ثلاث طبقات ──
--  ١) المهلة ٢٠ ثانية بدل ٥ — نفس القيمة التي نجحت فعليًّا بعد الفشل.
--  ٢) إعادة محاولةٍ واحدة تلقائيّة، **للفشل العابر وحده**: مهلة، أو انقطاعٌ
--     قبل الاستجابة، أو 5xx، أو غياب استجابةٍ أصلًا. أمّا 4xx (توكن خاطئ،
--     محادثة خاطئة) فلا تُعاد — إعادةُ خطأٍ منطقيّ تكرّره ولا تصلحه، وتُغرق
--     السجلّ بضجيجٍ يُخفي الأعطال الحقيقيّة.
--  ٣) أثرٌ مكتوبٌ في جدولٍ حقيقيّ (`alert_outbox`) لا في تلغرام نفسه — لأنّ
--     قناةً تُبلّغ عن فشل نفسها ليست قناة. فحصٌ دائم يقرأ هذا الجدول، فيظهر
--     العطل في `/فحص` ولو كان تلغرام ميّتًا بالكامل.
--
--  ── ما اختُبر حيًّا قبل التسليم (turn-simulation، لا الإنتاج) ──
--  • مهلةٌ حقيقيّة مُصطنَعة (timeout_milliseconds := 1) أنتجت timed_out=true
--    فعليًّا — نفس شكل حادثة الليلة، لا محاكاةً نظريّة.
--  • المكنسة صنّفتها «عابرة» وأطلقت إعادة محاولةٍ فعليّة بمعرّف طلبٍ جديد.
--  • بعد فشل الإعادة استقرّ الصفّ على status='failed' بأثرٍ مكتوب.
--  • وطلبٌ يعود 404 (توكن خاطئ) صُنّف «منطقيًّا» ولم يُعَد — attempts=1.
--
--  ⚠️ غير مطبَّق — للمراجعة والتطبيق بإذنٍ صريح بعد انتهاء الخدمة الحيّة.
-- ============================================================================

-- ── (١) الأثر المكتوب ───────────────────────────────────────────────────────
create table if not exists public.alert_outbox (
  id          bigint generated always as identity primary key,
  message     text        not null,
  request_id  bigint,
  attempts    int         not null default 1,
  -- sent → أُطلق وننتظر · retrying → فشل عابرًا وأُعيد · delivered → وصل
  -- · failed → استقرّ على الفشل، وهذا وحده ما يُشعل الفحص
  status      text        not null default 'sent',
  last_error  text,
  created_at  timestamptz not null default now(),
  settled_at  timestamptz
);

comment on table public.alert_outbox is
  'أثرُ كلّ رسالة تنبيهٍ للمالك ومصيرها. موجودٌ لأنّ قناةً تُبلّغ عن فشل نفسها ليست قناة.';

alter table public.alert_outbox enable row level security;
-- بلا أيّ سياسة عمدًا: لا ضيف ولا موظّف يقرؤه. الخادم وحده (service_role
-- يتجاوز RLS)، فالجدول مغلقٌ بالكامل لا مفتوحٌ بسياسةٍ متساهلة.
revoke all on public.alert_outbox from public, anon, authenticated;

-- الفهرس على المفتوح وحده: المكنسة تسأل عن غير المستقرّ فقط، وهو قلّةٌ دائمًا.
create index if not exists alert_outbox_open_idx
  on public.alert_outbox (created_at) where settled_at is null;
-- والفحص الدائم يسأل عن الفاشل خلال يوم — فهرسٌ جزئيٌّ ثانٍ صغير.
create index if not exists alert_outbox_failed_idx
  on public.alert_outbox (created_at) where status = 'failed';

-- ── (٢) الإرسال: مهلةٌ كافية + أثرٌ فورًا ──────────────────────────────────
create or replace function public.notify_telegram(p_message text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_token text; v_chat_id text; v_req_id bigint;
begin
  select value into v_token from public.alert_config where key = 'telegram_bot_token';
  select value into v_chat_id from public.alert_config where key = 'telegram_chat_id';
  if v_token is null or v_chat_id is null then return; end if;

  -- ٢٠ ثانية لا ٥: مصافحة SSL وحدها بلغت ٤٫٨٥ ثانية في حادثةٍ موثّقة، فمهلةُ
  -- خمسٍ تجعل نجاح الإنذار رهنَ حالة الشبكة لحظتَها.
  v_req_id := net.http_post(
    url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 20000,
    body := jsonb_build_object('chat_id', v_chat_id, 'text', p_message)
  );

  -- الأثر يُكتب قبل أن نعرف المصير: صفٌّ بلا نتيجةٍ يُلفت النظر، ورسالةٌ
  -- ضاعت بلا صفٍّ لا يلحظها أحد.
  insert into public.alert_outbox (message, request_id) values (p_message, v_req_id);
end;
$function$;

-- ── (٣) المكنسة: تحصيل النتائج، وإعادةٌ واحدة للعابر وحده ──────────────────
create or replace function public.sweep_alert_outbox()
 returns int
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r record;
  v_token text; v_chat_id text; v_new bigint; v_acted int := 0; v_why text;
begin
  select value into v_token   from public.alert_config where key = 'telegram_bot_token';
  select value into v_chat_id from public.alert_config where key = 'telegram_chat_id';

  for r in
    select o.id, o.message, o.attempts, o.created_at,
           resp.status_code, resp.timed_out, resp.error_msg,
           (resp.id is not null) as has_resp
      from public.alert_outbox o
      left join net._http_response resp on resp.id = o.request_id
     where o.settled_at is null
       -- مهلة الإرسال ٢٠ث: قبل مضيّها لا حكم — الطلب ما زال في الطريق.
       and o.created_at < now() - interval '25 seconds'
     order by o.id
     for update of o skip locked
  loop
    if r.has_resp and r.status_code between 200 and 299 then
      update public.alert_outbox
         set status = 'delivered', settled_at = now(), last_error = null
       where id = r.id;
      v_acted := v_acted + 1;

    elsif r.has_resp and r.status_code between 400 and 499 then
      -- منطقيّ: التوكن أو المحادثة خطأ. الإعادة تكرّر الخطأ حرفيًّا.
      update public.alert_outbox
         set status = 'failed', settled_at = now(),
             last_error = 'HTTP ' || r.status_code || ' — رفضٌ منطقيّ (توكن/محادثة؟) '
                          || coalesce(left(r.error_msg, 160), '')
       where id = r.id;
      v_acted := v_acted + 1;

    elsif (r.has_resp and (coalesce(r.timed_out, false) or r.status_code is null or r.status_code >= 500))
       or (not r.has_resp and r.created_at < now() - interval '2 minutes') then
      -- عابر: مهلة، أو انقطاعٌ قبل الاستجابة، أو 5xx، أو لا استجابة أصلًا.
      v_why := case
                 when not r.has_resp then 'لا استجابة خلال دقيقتين'
                 when coalesce(r.timed_out, false) then 'مهلة: ' || coalesce(left(r.error_msg, 160), '')
                 when r.status_code is null then 'انقطاعٌ قبل الاستجابة: ' || coalesce(left(r.error_msg, 160), '')
                 else 'HTTP ' || r.status_code
               end;

      if r.attempts < 2 and v_token is not null and v_chat_id is not null then
        v_new := net.http_post(
          url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
          headers := '{"Content-Type":"application/json"}'::jsonb,
          timeout_milliseconds := 20000,
          body := jsonb_build_object('chat_id', v_chat_id, 'text', r.message)
        );
        update public.alert_outbox
           set request_id = v_new, attempts = r.attempts + 1,
               status = 'retrying', created_at = now(), last_error = 'محاولة ١ فشلت — ' || v_why
         where id = r.id;
      else
        -- إعادةٌ واحدة لا أكثر: قناةٌ ساقطة تُبلَّغ مرّةً لا تُقصف بالمحاولات.
        update public.alert_outbox
           set status = 'failed', settled_at = now(),
               last_error = 'فشل بعد ' || r.attempts || ' محاولة — ' || v_why
         where id = r.id;
      end if;
      v_acted := v_acted + 1;
    end if;
    -- ما عدا ذلك (استجابة 1xx/3xx أو صفٌّ لم تمضِ مهلته): يُترك للدورة التالية.
  end loop;

  return v_acted;
end;
$function$;

revoke all on function public.sweep_alert_outbox() from public, anon, authenticated;

-- كل دقيقة: الإنذار المتأخّر دقيقةً مقبول، والضائع بلا أثرٍ ليس كذلك.
select cron.unschedule('sweep-alert-outbox')
 where exists (select 1 from cron.job where jobname = 'sweep-alert-outbox');
select cron.schedule('sweep-alert-outbox', '* * * * *', $cron$select public.sweep_alert_outbox();$cron$);

-- ── (٤) الفحص الدائم + بصمة الانحراف ───────────────────────────────────────
--  يُحدَّث بفارقٍ لا برقمٍ ثابت: ثلاثة PRs معلّقة الآن (#71 · #72 · #69) قد
--  تُدمج بأيّ ترتيب، ورقمٌ مكتوبٌ بيدي يصير خطأً بحسب من سبق. فنقرأ الرقم
--  القائم ونضيف فارقنا وحده: **جدولٌ واحد** (alert_outbox) و**دالّةٌ واحدة**
--  (sweep_alert_outbox) — وnotify_telegram مُستبدَلةٌ لا مضافة.
do $mig$
declare v_def text; v_tables int; v_funcs int;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'run_critical_checks';
  if v_def is null then raise exception 'run_critical_checks غير موجودة — توقّف'; end if;

  v_tables := (regexp_match(v_def, 'c\.relkind=''r''\) = (\d+)'))[1]::int;
  v_funcs  := (regexp_match(v_def, 'p\.prokind=''f''\) = (\d+)'))[1]::int;
  if v_tables is null or v_funcs is null then
    raise exception 'لم أجد بصمة q20 — راجع يدويًّا قبل المتابعة';
  end if;

  v_def := replace(v_def, 'c.relkind=''r'') = ' || v_tables, 'c.relkind=''r'') = ' || (v_tables + 1));
  v_def := replace(v_def, 'p.prokind=''f'') = ' || v_funcs,  'p.prokind=''f'') = ' || (v_funcs + 1));

  -- الفحص الجديد — idempotent: لا يُضاف مرّتين.
  if position('w33_alert_channel_delivering' in v_def) = 0 then
    if position(E'    (''q20_schema_no_drift'',' in v_def) = 0 then
      raise exception 'لم أجد موضع إدراج الفحص — راجع يدويًّا';
    end if;
    v_def := replace(v_def, E'    (''q20_schema_no_drift'',',
         E'    (''w33_alert_channel_delivering'', not exists (\n'
      || E'        select 1 from public.alert_outbox\n'
      || E'         where status = ''failed'' and created_at > now() - interval ''24 hours'')),\n'
      || E'    (''q20_schema_no_drift'',');
  end if;

  execute v_def;
end
$mig$;

-- المتوقَّع بعد التطبيق:
--  • notify_telegram تكتب صفًّا في alert_outbox مع كلّ رسالة.
--  • sweep-alert-outbox يعمل كل دقيقة ويستقرّ بكلّ صفٍّ على delivered أو failed.
--  • w33_alert_channel_delivering أحمر إن استقرّت رسالةٌ على الفشل خلال يوم —
--    ويعود أخضر تلقائيًّا بعد ٢٤ ساعة من آخر فشل، فلا يبقى أحمر إلى الأبد.
