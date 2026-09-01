-- ════════ التقرير اليوميّ الشامل — لقطةٌ تُخزَّن، ثم نصٌّ يُرسَل ════════
--
-- الغرض: أن يقرأ المالك حالة المنصّة كاملةً في رسالةٍ واحدة، ثم يرسلها
-- لمساعده فيشخّص أي خللٍ من التقرير نفسه بلا حفرٍ إضافيّ.
--
-- القاعدة الحاكمة التي بُني عليها كلّ سطرٍ هنا: **كلّ رقمٍ يُقرأ من
-- القاعدة فعليًّا**. وما تعذّر قياسه يُكتب «لم يُقَس» ومعه سببُ التعذّر —
-- لا تقدير، ولا استنتاج، ولا رقمٌ مخترَع. ولهذا ترى في الكود مرارًا
-- `to_regprocedure(...) is null` و`to_regclass(...) is null`: كلّ مصدرٍ
-- قد يغيب يُسأل عن وجوده أوّلًا، فإن غاب قال التقريرُ إنّه غاب.
--
-- ولمَ لقطةٌ مخزَّنة قبل التقرير؟ لأنّ القسمين ٦ و٧ (خيوط التحقيق،
-- والتغيّر بلا سبب) يستحيلان بلا ماضٍ يُقارَن به: «متى كان هذا البند
-- سليمًا آخر مرّة، وما الذي تغيّر في تلك النافذة» سؤالٌ لا يُجيبه حاضرٌ
-- وحده. فاللقطة أساسٌ، والتقرير مبنيٌّ عليها.
--
-- الكتابة: صفُّ اللقطة وحده (و`alert_outbox` عند فشل الإرسال، كي لا
-- يضيع صامتًا). وما عدا ذلك قراءةٌ محضة — لا يلمس هذا النظام أيّ تنبيهٍ
-- أو حارسٍ قائم، ولا يعدّل صفًّا واحدًا من بيانات التشغيل.

-- ── ١) الجدول: لقطةٌ واحدة لكلّ يومٍ رياضيّ ──────────────────────────
--
-- `day_key` بمفتاحٍ فريد لا `taken_at` وحده: التشغيل اليدويّ للاختبار
-- يجب أن يحدّث لقطة اليوم لا أن يصنع ثانيةً تكسر مقارنة «الأمس».
--
-- ولا سياسات RLS عليه بتاتًا، ولا صلاحيات لـ anon/authenticated — نفس
-- نمط `alert_outbox` حرفيًّا: جدولٌ تشغيليّ لا يراه عميلٌ ولا موظّف،
-- يقرؤه postgres وservice_role فقط. (وبهذا لا يتغيّر عدّاد السياسات في
-- q20 — RLS مشتغلةٌ بلا سياسةٍ واحدة تعني «لا أحد» لا «الجميع».)
create table if not exists public.daily_snapshot (
  id           bigserial primary key,
  day_key      date        not null unique,
  taken_at     timestamptz not null default now(),
  payload      jsonb       not null,
  report_text  text,
  parts        int,
  sent_at      timestamptz,
  send_status  text,
  send_note    text
);

alter table public.daily_snapshot enable row level security;
revoke all on public.daily_snapshot from anon, authenticated;

create index if not exists daily_snapshot_taken_idx on public.daily_snapshot (taken_at desc);

comment on table public.daily_snapshot is
  'لقطةٌ يوميّة للمنصّة (بصمات الدوال، عدّادات البنية، أعلام الفروع، الترحيلات، نتائج الفحوص، مقاييس التشغيل) — أساس القسمين ٦ و٧ من التقرير اليوميّ. تُحفظ ٩٠ يومًا.';


-- ── ٢) snapshot_payload(): جمع الحقائق، قراءةً محضة ─────────────────
--
-- مقسومةٌ عمدًا عن الدالّة التي تكتب: هذه لا تلمس صفًّا، فيمكن استدعاؤها
-- على الإنتاج في أيّ لحظةٍ للتحقّق بلا أثر.
create or replace function public.snapshot_payload()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v          jsonb;
  v_critical jsonb;
  v_health   jsonb;
  v_iso      jsonb;
  v_metrics  jsonb;
  v_flags    jsonb := '[]'::jsonb;
  v_from     timestamptz := now() - interval '24 hours';
begin
  -- ══ الفحوص الثلاثة ══
  -- الحرجة: دالّةٌ مخزّنة، تُستدعى كما هي بلا لمسها.
  if to_regprocedure('public.run_critical_checks()') is null then
    v_critical := jsonb_build_object('measured', false,
                    'why', 'run_critical_checks غير موجودة في هذه القاعدة');
  else
    execute $q$
      select jsonb_build_object('measured', true,
               'passed', count(*) filter (where pass), 'total', count(*),
               'failed', coalesce(jsonb_agg(name order by name)
                          filter (where not pass), '[]'::jsonb))
        from public.run_critical_checks()
    $q$ into v_critical;
  end if;

  if to_regprocedure('public.check_platform_health()') is null then
    v_health := jsonb_build_object('measured', false,
                  'why', 'check_platform_health غير موجودة في هذه القاعدة');
  else
    execute $q$
      with h as (select public.check_platform_health() as j)
      select jsonb_build_object('measured', true,
               'green', (select count(*) from jsonb_each(j) where key<>'checked_at'
                          and (value->>'ok')::boolean),
               'total', (select count(*) from jsonb_each(j) where key<>'checked_at'),
               'red', (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
                        from jsonb_each(j) where key<>'checked_at'
                          and (value->>'ok')::boolean is false))
        from h
    $q$ into v_health;
  end if;

  -- فحوص العزل: **لا تُقاس آليًّا، وهذا قرارٌ لا نقص**.
  -- ملفّها `supabase/tests/isolation_checks.sql` يبني مستأجرًا كاملًا («ب»)
  -- ثمّ يلغي المعاملة. تشغيله من cron على الإنتاج يعني إنشاء بيانات
  -- وهميّة في قاعدةٍ حيّة والرهانَ على أنّ التراجع لن يفشل أبدًا — وهو
  -- خطُّ CHARTER الأحمر الأوّل. فنقول «لم يُقَس» ونذكر كيف يُقاس يدويًّا،
  -- ولا نضع مكانه فحصًا أخفّ يُقرأ كأنّه هو.
  v_iso := jsonb_build_object('measured', false,
             'why', 'فحوص العزل نصٌّ يُشغَّل يدويًّا داخل معاملةٍ تُلغى: '
                 || 'psql "$SUPABASE_DB_URL" -f supabase/tests/isolation_checks.sql — '
                 || 'تشغيلها آليًّا يعني إنشاء مستأجرٍ وهميّ في قاعدةٍ حيّة');

  -- ══ مقاييس التشغيل والأعمال ══
  -- منفصلةٌ عن البنية في مفتاحٍ خاصّ `metrics`، لأنّ القسم ٧ يقارن ما
  -- **يجب** أن يثبت (بصمات، عدّادات، أعلام). أمّا الأرقام التشغيليّة
  -- فتغيّرها هو الطبيعيّ، ومقارنتها ستُغرق التقرير بضجيجٍ يخفي الإشارة.
  select jsonb_build_object(
    'window', jsonb_build_object('from', v_from, 'to', now(),
                'note', 'آخر ٢٤ ساعة — لا يومًا تقويميًّا: التقرير يُرسَل ٠٧:٠٠ '
                     || 'والفروع كلّها مغلقة حينها، فالنافذة تلتقط يوم تشغيلٍ كاملًا'),

    'db_size_bytes', pg_database_size(current_database()),

    'connections', jsonb_build_object(
      'used', (select count(*) from pg_stat_activity where datname = current_database()),
      'cap',  current_setting('max_connections')::int),

    -- استعلامٌ تجاوز ٣٠ ثانية: START_REPLICATION مستثنًى لأنّه اتّصال
    -- النسخ المستمرّ — عمرُه بالساعات بحكم التصميم لا بحكم العطل.
    'long_queries', (select coalesce(jsonb_agg(jsonb_build_object(
                        'pid', pid, 'seconds', round(extract(epoch from now()-query_start))::int,
                        'state', state, 'query', left(query, 200))), '[]'::jsonb)
                     from pg_stat_activity
                      where state = 'active'
                        and now() - query_start > interval '30 seconds'
                        and query not ilike '%pg_stat_activity%'
                        and query not ilike 'START_REPLICATION%'),

    'slowest', case
      when to_regclass('extensions.pg_stat_statements') is null
        then jsonb_build_object('measured', false, 'why', 'pg_stat_statements غير مركّبة')
      else (select jsonb_build_object('measured', true,
                     'since', (select min(stats_since) from extensions.pg_stat_statements),
                     'top', coalesce(jsonb_agg(t order by t->>'rank'), '[]'::jsonb))
              from (select jsonb_build_object(
                       'rank', row_number() over (order by total_exec_time desc),
                       'calls', calls,
                       'mean_ms', round(mean_exec_time::numeric, 1),
                       'total_ms', round(total_exec_time::numeric, 0),
                       'query', left(regexp_replace(query, '\s+', ' ', 'g'), 160)) as t
                      from extensions.pg_stat_statements
                     order by total_exec_time desc limit 3) s)
      end,

    'growth', jsonb_build_object(
      'queue_events_total', (select count(*) from public.queue_events),
      'queue_events_24h',   (select count(*) from public.queue_events where at >= v_from),
      'admin_audit_total',  (select count(*) from public.admin_audit),
      'admin_audit_24h',    (select count(*) from public.admin_audit where at >= v_from)),

    'outbox_24h', (select jsonb_build_object(
                     'total',   count(*),
                     'failed',  count(*) filter (where status = 'failed'),
                     'pending', count(*) filter (where settled_at is null))
                   from public.alert_outbox where created_at >= v_from),

    'client_errors_24h', case
      when to_regclass('public.client_errors') is null
        then jsonb_build_object('measured', false, 'why', 'client_errors غير موجودة')
      else (select jsonb_build_object('measured', true, 'count', count(*))
              from public.client_errors where at >= v_from) end,

    -- ══ النشاط لكلّ مطعمٍ حيّ ══
    -- التعريفات **منقولةٌ حرفيًّا** عن صفحة التقارير العاملة
    -- (src/app/dashboard/reports/page.tsx): النافذة على `joined_at`،
    -- و«خدمناهم» = seated ومعه seated_at، والانتظار من الجالسين وحدهم
    -- بمرشّح 0 ≤ د < 600. رقمان مختلفان لنفس الشيء في شاشتين أسوأ من
    -- رقمٍ واحدٍ ناقص.
    'business', (
      select coalesce(jsonb_agg(x order by x->>'slug'), '[]'::jsonb) from (
        select jsonb_build_object(
                 'slug', r.slug, 'name', r.name, 'is_canary', r.is_canary,
                 'joined',  count(w.id),
                 'served',  count(*) filter (where w.status='seated' and w.seated_at is not null),
                 'cancelled', count(*) filter (where w.status='cancelled'),
                 'no_show', count(*) filter (where w.status='no_show'),
                 'expired', count(*) filter (where w.status='expired'),
                 -- 'confirmed' ليست حالةً في القاعدة (المُعدّ enum: waiting,
                 -- notified, seated, cancelled, no_show, expired) — التأكيد
                 -- عمودُ وقتٍ لا حالة. فلا نسأل عمّا لا يوجد.
                 'waiting', count(*) filter (where w.status in ('waiting','notified')),
                 'avg_wait_min', (select round(avg(m))::int from (
                    select extract(epoch from (w2.seated_at - w2.joined_at))/60 as m
                      from public.waitlist_entries w2
                      join public.branches b2 on b2.id = w2.branch_id
                     where b2.restaurant_id = r.id and w2.joined_at >= v_from
                       and w2.status='seated' and w2.seated_at is not null
                       and extract(epoch from (w2.seated_at - w2.joined_at))/60 >= 0
                       and extract(epoch from (w2.seated_at - w2.joined_at))/60 <  600) q),
                 -- الوسيط بجانب المتوسّط: إغلاقٌ جماعيّ واحدٌ في آخر
                 -- الليل يرفع المتوسّط وحده ولا يمسّ الوسيط، فالفجوة
                 -- بينهما هي الدليل على أنّ الرقم الأوّل ليس تجربة الضيف.
                 'median_wait_min', (select round(percentile_cont(0.5) within group (order by m))::int from (
                    select extract(epoch from (w2.seated_at - w2.joined_at))/60 as m
                      from public.waitlist_entries w2
                      join public.branches b2 on b2.id = w2.branch_id
                     where b2.restaurant_id = r.id and w2.joined_at >= v_from
                       and w2.status='seated' and w2.seated_at is not null
                       and extract(epoch from (w2.seated_at - w2.joined_at))/60 >= 0
                       and extract(epoch from (w2.seated_at - w2.joined_at))/60 <  600) q)
               ) as x
          from public.restaurants r
          join public.branches b on b.restaurant_id = r.id
          left join public.waitlist_entries w
                 on w.branch_id = b.id and w.joined_at >= v_from
         where r.is_active
         group by r.id, r.slug, r.name, r.is_canary) s)
  ) into v_metrics;

  -- ══ اللقطة ══
  select jsonb_build_object(
    'taken_at', now(),
    'riyadh',   to_char(now() at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI'),

    -- بصمة كلّ دالّة عامّة بالبايت: الانحراف يُكتشف بالمقارنة لا بالتخمين.
    -- وهي أوسع من q20 عمدًا — q20 يعدّ الدوال ولا يعرف أيّها تغيّر.
    'fn_md5', (select coalesce(jsonb_object_agg(
                 p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
                 md5(pg_get_functiondef(p.oid))), '{}'::jsonb)
               from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.prokind = 'f'),

    'struct', jsonb_build_object(
      'tables',   (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
                    where n.nspname='public' and c.relkind='r'),
      'functions',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                    where n.nspname='public' and p.prokind='f'),
      'policies', (select count(*) from pg_policies where schemaname='public'),
      'fks',      (select count(*) from pg_constraint c join pg_class r on r.oid=c.conrelid
                    join pg_namespace n on n.oid=r.relnamespace
                   where n.nspname='public' and c.contype='f')),

    'branches', (select coalesce(jsonb_agg(jsonb_build_object(
                   'branch_id', b.id, 'slug', r.slug, 'name', b.name,
                   'is_active', b.is_active, 'is_canary', r.is_canary,
                   'manually_closed', coalesce(bs.manually_closed, false),
                   'queue_paused',    coalesce(bs.queue_paused, false),
                   'join_frozen',     coalesce(bs.join_frozen, false),
                   'join_frozen_reason', bs.join_frozen_reason,
                   'accepts_waitlist',   bs.accepts_waitlist,
                   'max_waitlist_size',  bs.max_waitlist_size,
                   'opening_hours',      bs.opening_hours,
                   'open_now', public.branch_open_by_hours(bs.opening_hours, now()))
                 order by r.slug, b.name), '[]'::jsonb)
                 from public.branches b
                 join public.restaurants r on r.id = b.restaurant_id
                 left join public.branch_settings bs on bs.branch_id = b.id),

    'migrations', (select jsonb_build_object('count', count(*), 'last', max(version))
                     from supabase_migrations.schema_migrations),

    -- Vercel لا يصل القاعدة: نقولها ولا نخمّن. ولو كتبنا هنا «آخر نشرٍ
    -- أمس» استنتاجًا من آخر ترحيل لكان ذلك رقمًا مخترعًا بالضبط.
    'last_deploy', jsonb_build_object('measured', false,
                     'why', 'بيانات نشر Vercel لا تصل قاعدة البيانات — تُقرأ من لوحة Vercel'),

    'checks', jsonb_build_object(
      'critical', v_critical, 'platform_health', v_health, 'isolation', v_iso),

    'metrics', v_metrics
  ) into v;

  return jsonb_set(v, '{flags}', public.report_flags(v));
end;
$fn$;
comment on function public.snapshot_payload() is
  'يجمع حقائق المنصّة قراءةً محضة (لا يكتب صفًّا) ويحسب أعلام الحالة ميكانيكيًّا. ما تعذّر قياسه يعود measured=false ومعه السبب.';



-- ── ٢-ب) report_flags(): قواعد الحكم، دالّةٌ صافية مستقلّة ────────────
--
-- مفصولةٌ عن جمع الحقائق عمدًا: القسم ١ (الحكم) والقسم ٥ (ما يحتاج
-- انتباهًا) والقسم ٦ (خيوط التحقيق) كلّها مشتقّةٌ من هذه القائمة وحدها،
-- فما لم يصر علمًا هنا لا يُذكر حكمًا هناك. وكونها صافيةً يعني أنّ
-- القواعد تُختبر على أيّ حمولةٍ محفوظة — بما فيها حمولة الإنتاج — بلا
-- لمس قاعدةٍ حيّة.
--
-- وكلّ علمٍ شرطٌ منطقيّ واحدٌ صريح: لا «يبدو» ولا «قد يكون».
create or replace function public.report_flags(v jsonb)
returns jsonb
language plpgsql
immutable
set search_path to 'pg_temp'
as $fn$
declare v_flags jsonb := '[]'::jsonb;
begin
  if (v->'checks'->'critical'->>'measured')::boolean
     and (v->'checks'->'critical'->>'passed')::int < (v->'checks'->'critical'->>'total')::int then
    v_flags := v_flags || jsonb_build_object('key','critical_failed','level','red',
      'what', 'فحوصٌ حرجة راسبة: ' || (v->'checks'->'critical'->>'failed'),
      'where','run_critical_checks()');
  end if;

  if (v->'checks'->'platform_health'->>'measured')::boolean
     and (v->'checks'->'platform_health'->>'green')::int < (v->'checks'->'platform_health'->>'total')::int then
    v_flags := v_flags || jsonb_build_object('key','health_red','level','red',
      'what', 'صحّة المنصّة حمراء: ' || (select string_agg(key, '، ')
                from jsonb_each(v->'checks'->'platform_health'->'red')),
      'where','check_platform_health()');
  end if;

  if jsonb_array_length(v->'metrics'->'long_queries') > 0 then
    v_flags := v_flags || jsonb_build_object('key','long_query','level','red',
      'what', jsonb_array_length(v->'metrics'->'long_queries') || ' استعلامًا تجاوز ٣٠ ثانية',
      'where','pg_stat_activity');
  end if;

  if (v->'metrics'->'outbox_24h'->>'failed')::int > 0 then
    v_flags := v_flags || jsonb_build_object('key','outbox_failed','level','red',
      'what', (v->'metrics'->'outbox_24h'->>'failed') || ' رسالة تنبيهٍ فشل إرسالها',
      'where','alert_outbox');
  end if;

  if (v->'metrics'->'connections'->>'used')::int * 100
       / greatest((v->'metrics'->'connections'->>'cap')::int, 1) >= 80 then
    v_flags := v_flags || jsonb_build_object('key','connections_high','level','warn',
      'what', 'الاتّصالات ' || (v->'metrics'->'connections'->>'used') || '/'
              || (v->'metrics'->'connections'->>'cap'),
      'where','pg_stat_activity');
  end if;

  -- فرعٌ حيٌّ مفتوحٌ بساعاته ومع ذلك بابه مغلق: ليس عطلًا بالضرورة (قد
  -- يكون قرارًا واعيًا)، ولذلك تحذيرٌ لا أحمر. لكنّه يُذكر دائمًا، لأنّ
  -- أخطر إقفالٍ هو المنسيّ.
  --
  -- والكناري مستثنًى: أعلامه تضبطها المراقبة لا المضيف — و«فرع النبض»
  -- موقوف الطابور بالتصميم، وcron الفجر يعيده كذلك كلّ يوم. فلو ذُكر
  -- لظهر تحذيرٌ ثابتٌ كلّ صباحٍ يعلّم القارئَ تجاهلَ القسم ٥ كلّه — وذلك
  -- أسوأ من عدم وجوده. وصحّة الكناري نفسها مغطّاةٌ في
  -- check_platform_health (booking_writepath) لا هنا.
  if exists (select 1 from jsonb_array_elements(v->'branches') b
              where (b->>'is_active')::boolean and (b->>'open_now')::boolean
                and not coalesce((b->>'is_canary')::boolean, false)
                and ((b->>'manually_closed')::boolean or (b->>'join_frozen')::boolean
                     or (b->>'queue_paused')::boolean)) then
    v_flags := v_flags || jsonb_build_object('key','branch_shut_while_open','level','warn',
      'what', (select string_agg(b->>'slug' || '/' || (b->>'name') || ': '
                 || concat_ws('+', case when (b->>'manually_closed')::boolean then 'مغلق يدويًّا' end,
                                   case when (b->>'queue_paused')::boolean then 'الطابور موقوف' end,
                                   case when (b->>'join_frozen')::boolean then 'الانضمام موقوف'
                                        || coalesce(' («'||(b->>'join_frozen_reason')||'»)', '') end), '؛ ')
               from jsonb_array_elements(v->'branches') b
              where (b->>'is_active')::boolean and (b->>'open_now')::boolean
                and not coalesce((b->>'is_canary')::boolean, false)
                and ((b->>'manually_closed')::boolean or (b->>'join_frozen')::boolean
                     or (b->>'queue_paused')::boolean)),
      'where','branch_settings');
  end if;

  return v_flags;
end;
$fn$;

-- ── ٣) take_daily_snapshot(): الكاتب الوحيد ─────────────────────────
create or replace function public.take_daily_snapshot()
returns bigint
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare v_id bigint; v_day date;
begin
  -- اليوم الرياضيّ لا يوم UTC: الإرسال ٠٧:٠٠ بالرياض = ٠٤:٠٠ UTC،
  -- ولو استعملنا now()::date لكان مفتاح اليوم صحيحًا صدفةً في هذه
  -- الساعة وخاطئًا في أيّ تشغيلٍ يدويّ مساءً.
  v_day := (now() at time zone 'Asia/Riyadh')::date;

  insert into public.daily_snapshot (day_key, payload)
  values (v_day, public.snapshot_payload())
  on conflict (day_key) do update
    set payload = excluded.payload, taken_at = now()
  returning id into v_id;

  -- استبقاء ٩٠ يومًا
  delete from public.daily_snapshot where taken_at < now() - interval '90 days';

  return v_id;
end;
$fn$;

revoke all on function public.take_daily_snapshot() from public, anon, authenticated;

comment on function public.take_daily_snapshot() is
  'يخزّن لقطة اليوم (صفٌّ واحدٌ لكلّ يومٍ رياضيّ) ويحذف ما تجاوز ٩٠ يومًا. الكاتب الوحيد في هذا النظام.';


-- ── ٤) daily_report_text(): النصّ، دالّةٌ صافية ──────────────────────
--
-- تأخذ لقطتين وتعيد مصفوفة أجزاءٍ جاهزةٍ للإرسال. صافيةٌ تمامًا: لا
-- تقرأ القاعدة ولا تكتب فيها — فيمكن تشغيلها على أيّ لقطتين محفوظتين
-- لإعادة إنتاج تقرير يومٍ ماضٍ حرفيًّا.
create or replace function public.daily_report_text(p_today jsonb, p_prev jsonb, p_hist jsonb default '[]'::jsonb)
returns text[]
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $fn$
declare
  t     text := '';
  s     text;
  n_red int;  n_warn int;
  parts text[] := '{}';
  buf   text := '';
  ln    text;
  LIMIT_CHARS constant int := 3800;   -- حدّ تلغرام ٤٠٩٦، والهامش للترقيم
begin
  n_red  := (select count(*) from jsonb_array_elements(p_today->'flags') f where f->>'level'='red');
  n_warn := (select count(*) from jsonb_array_elements(p_today->'flags') f where f->>'level'='warn');

  -- ══════════ ١) الحكم في سطر ══════════
  -- مشتقٌّ من عدّ الأعلام وحده. لا صياغة إنشائيّة، ولا «الوضع ممتاز».
  t := t || '📋 تقرير «دور» اليوميّ — ' || coalesce(p_today->>'riyadh','?') || ' (الرياض)' || E'\n'
         || '════════════════════' || E'\n\n'
         || '① الحكم: ' ||
         case when n_red > 0  then '🔴 يحتاج تدخّلًا — ' || n_red || ' بندًا أحمر'
                                   || case when n_warn>0 then ' و' || n_warn || ' تحذيرًا' else '' end
              when n_warn > 0 then '🟡 يعمل مع ملاحظات — ' || n_warn || ' تحذيرًا، ولا بند أحمر'
              else '🟢 سليم — لا بند أحمر ولا تحذير' end || E'\n\n';

  -- ══════════ ٢) الصحّة التقنيّة ══════════
  t := t || '② الصحّة التقنيّة' || E'\n';

  t := t || '• الفحوص الحرجة: ' ||
       case when (p_today->'checks'->'critical'->>'measured')::boolean
            then (p_today->'checks'->'critical'->>'passed') || '/' || (p_today->'checks'->'critical'->>'total')
                 || case when (p_today->'checks'->'critical'->>'passed')::int
                            < (p_today->'checks'->'critical'->>'total')::int
                         then ' — الراسب: ' || (p_today->'checks'->'critical'->>'failed') else '' end
            else 'لم يُقَس — ' || (p_today->'checks'->'critical'->>'why') end || E'\n';

  t := t || '• صحّة المنصّة: ' ||
       case when (p_today->'checks'->'platform_health'->>'measured')::boolean
            then (p_today->'checks'->'platform_health'->>'green') || '/' || (p_today->'checks'->'platform_health'->>'total')
                 || coalesce(' — الأحمر: ' || (select string_agg(key || ' («' || coalesce(value->>'detail', value->>'why', '?') || '»)', '، ')
                        from jsonb_each(p_today->'checks'->'platform_health'->'red')), '')
            else 'لم يُقَس — ' || (p_today->'checks'->'platform_health'->>'why') end || E'\n';

  t := t || '• فحوص العزل: لم تُقَس — ' || (p_today->'checks'->'isolation'->>'why') || E'\n';

  t := t || '• البنية: ' || (p_today->'struct'->>'tables') || ' جدولًا · '
         || (p_today->'struct'->>'functions') || ' دالّة · '
         || (p_today->'struct'->>'policies') || ' سياسة · '
         || (p_today->'struct'->>'fks') || ' مفتاحًا أجنبيًّا' || E'\n';

  t := t || '• الترحيلات: ' || (p_today->'migrations'->>'count') || ' مطبَّقًا، آخرها '
         || (p_today->'migrations'->>'last') || E'\n';

  t := t || '• آخر نشر Vercel: لم يُقَس — ' || (p_today->'last_deploy'->>'why') || E'\n\n';

  -- ══════════ ٣) الأداء والحِمل ══════════
  t := t || '③ الأداء والحِمل' || E'\n'
         || '• حجم القاعدة: ' || round((p_today->'metrics'->>'db_size_bytes')::numeric / 1048576) || ' م.ب' || E'\n'
         || '• الاتّصالات: ' || (p_today->'metrics'->'connections'->>'used') || '/'
         || (p_today->'metrics'->'connections'->>'cap') || E'\n'
         || '• استعلامٌ تجاوز ٣٠ث (عدا START_REPLICATION): ' ||
            case when jsonb_array_length(p_today->'metrics'->'long_queries') = 0 then 'لا شيء'
                 else (select string_agg((q->>'seconds') || 'ث: ' || (q->>'query'), ' | ')
                         from jsonb_array_elements(p_today->'metrics'->'long_queries') q) end || E'\n';

  if (p_today->'metrics'->'slowest'->>'measured')::boolean then
    t := t || '• أثقل ٣ استعلامات تراكميًّا (منذ ' || left(coalesce(p_today->'metrics'->'slowest'->>'since','?'),16) || '):' || E'\n';
    for s in select '   ' || (q->>'rank') || '. ' || (q->>'total_ms') || 'مث إجمالًا · '
                 || (q->>'calls') || ' نداءً · ' || (q->>'mean_ms') || 'مث وسطيًّا' || E'\n      '
                 || (q->>'query')
               from jsonb_array_elements(p_today->'metrics'->'slowest'->'top') q
              order by (q->>'rank')::int loop
      t := t || s || E'\n';
    end loop;
  else
    t := t || '• أثقل الاستعلامات: لم يُقَس — ' || (p_today->'metrics'->'slowest'->>'why') || E'\n';
  end if;

  t := t || '• نموّ السجلّات (٢٤س/الإجمالي): queue_events '
         || (p_today->'metrics'->'growth'->>'queue_events_24h') || '/' || (p_today->'metrics'->'growth'->>'queue_events_total')
         || ' · admin_audit ' || (p_today->'metrics'->'growth'->>'admin_audit_24h') || '/'
         || (p_today->'metrics'->'growth'->>'admin_audit_total') || E'\n'
         || '• تنبيهات ٢٤س: ' || (p_today->'metrics'->'outbox_24h'->>'total') || ' مرسَلة، '
         || (p_today->'metrics'->'outbox_24h'->>'failed') || ' فاشلة، '
         || (p_today->'metrics'->'outbox_24h'->>'pending') || ' معلَّقة' || E'\n'
         || '• أخطاء الواجهة ٢٤س: ' ||
            case when (p_today->'metrics'->'client_errors_24h'->>'measured')::boolean
                 then (p_today->'metrics'->'client_errors_24h'->>'count')
                 else 'لم يُقَس — ' || (p_today->'metrics'->'client_errors_24h'->>'why') end || E'\n\n';

  -- ══════════ ٤) النشاط التجاريّ ══════════
  t := t || '④ النشاط — آخر ٢٤ ساعة' || E'\n';
  if jsonb_array_length(p_today->'metrics'->'business') = 0 then
    t := t || '• لا مطاعم حيّة' || E'\n';
  else
    for s in select '• ' || (b->>'name') || ' (' || (b->>'slug') || ')'
                 || case when (b->>'is_canary')::boolean then ' [كناري]' else '' end || E'\n'
                 || '   انضمّ ' || (b->>'joined') || ' · خُدم ' || (b->>'served')
                 || ' · أُلغي ' || (b->>'cancelled') || ' · تغيّب ' || (b->>'no_show')
                 || ' · انتهت صلاحيته ' || (b->>'expired')
                 || ' · ما زال ينتظر ' || (b->>'waiting') || E'\n'
                 -- بلا جالسين لا متوسّط ولا وسيط: «لا جالسين د» تُقرأ وحدةً
                 -- معلّقة بلا رقم، فنقول الجملة كاملةً أو لا نقولها
                 || case when (b->>'avg_wait_min') is null
                         then '   الانتظار: لا جالسين في النافذة — لا متوسّط ولا وسيط'
                         else '   الانتظار: متوسّط ' || (b->>'avg_wait_min') || ' د · وسيط '
                              || (b->>'median_wait_min') || ' د' end
                 || case when (b->>'avg_wait_min') is not null and (b->>'median_wait_min') is not null
                          and (b->>'avg_wait_min')::int > (b->>'median_wait_min')::int * 2
                         then E'\n   ⚠ الفجوة ضِعف: حالاتٌ متطرّفة ترفع المتوسّط، والوسيط أقرب لتجربة الضيف'
                         else '' end
               from jsonb_array_elements(p_today->'metrics'->'business') b
              order by b->>'slug' loop
      t := t || s || E'\n';
    end loop;
  end if;
  t := t || E'\n';

  -- ══════════ ٥) ما يحتاج انتباهًا ══════════
  t := t || '⑤ ما يحتاج انتباهًا' || E'\n';
  if jsonb_array_length(p_today->'flags') = 0 then
    t := t || '• لا شيء' || E'\n';
  else
    for s in select case when f->>'level'='red' then '🔴 ' else '🟡 ' end
                 || (f->>'what') || E'\n   الموضع: ' || (f->>'where')
                 || E'\n   منذ: ' || public.report_since_label(f->>'key', p_hist)
               from jsonb_array_elements(p_today->'flags') f loop
      t := t || '• ' || s || E'\n';
    end loop;
  end if;
  t := t || E'\n';

  -- ══════════ ٦) خيوط التحقيق ══════════
  -- لكلّ بندٍ غير سليم: متى كان سليمًا آخر مرّة، وما الذي تغيّر بين تلك
  -- اللقظة واليوم. من اللقطات المحفوظة لا من التخمين — وإن لم يكن ثمّ
  -- ماضٍ محفوظ قال ذلك صراحةً.
  t := t || '⑥ خيوط التحقيق' || E'\n';
  if jsonb_array_length(p_today->'flags') = 0 then
    t := t || '• لا بنود غير سليمة — لا خيوط' || E'\n';
  elsif jsonb_array_length(p_hist) = 0 then
    t := t || '• لا لقطات سابقة محفوظة بعد — لا يمكن تحديد «متى كان سليمًا»' || E'\n';
  else
    for s in select (f->>'what') || E'\n   '
                 || public.report_since_label(f->>'key', p_hist)
                 || E'\n   ما تغيّر في تلك النافذة: '
                 || public.report_window_change(f->>'key', p_today, p_hist)
               from jsonb_array_elements(p_today->'flags') f loop
      t := t || '• ' || s || E'\n';
    end loop;
  end if;
  t := t || E'\n';

  -- ══════════ ٧) شيءٌ تغيّر بلا سبب معروف ══════════
  -- الفكرة: كلّ تغيّرٍ بنيويّ يجب أن يكون له سببٌ مسجَّل — ترحيلٌ جديد.
  -- فإن تغيّرت بصمة دالّةٍ أو عدّادٌ بنيويّ **وعدد الترحيلات كما هو**،
  -- فذاك تغيّرٌ دخل القاعدة من خارج المسار الموثَّق: يُرفع صريحًا.
  t := t || '⑦ شيءٌ تغيّر بلا سبب معروف' || E'\n';
  if p_prev is null then
    t := t || '• لا لقطة أمس — أوّل تشغيل، فلا مقارنة' || E'\n';
  else
    declare
      v_mig_changed boolean := (p_today->'migrations'->>'count') is distinct from (p_prev->'migrations'->>'count');
      v_fn_diff     text;
      v_struct_diff text;
      v_flag_diff   text;
      v_any         boolean := false;
    begin
      select string_agg(k, '، ') into v_fn_diff from (
        select key as k from jsonb_each_text(p_today->'fn_md5')
         where value is distinct from (p_prev->'fn_md5'->>key)
        union
        select key from jsonb_each_text(p_prev->'fn_md5')
         where not (p_today->'fn_md5') ? key) d;

      select string_agg(key || ': ' || (p_prev->'struct'->>key) || '→' || value, '، ')
        into v_struct_diff
        from jsonb_each_text(p_today->'struct')
       where value is distinct from (p_prev->'struct'->>key);

      select string_agg(k, '؛ ') into v_flag_diff from (
        select (b->>'slug') || '/' || (b->>'name') || ': '
               || concat_ws('، ',
                    case when (b->>'manually_closed') is distinct from (pb->>'manually_closed')
                         then 'manually_closed ' || (pb->>'manually_closed') || '→' || (b->>'manually_closed') end,
                    case when (b->>'queue_paused') is distinct from (pb->>'queue_paused')
                         then 'queue_paused ' || (pb->>'queue_paused') || '→' || (b->>'queue_paused') end,
                    case when (b->>'join_frozen') is distinct from (pb->>'join_frozen')
                         then 'join_frozen ' || (pb->>'join_frozen') || '→' || (b->>'join_frozen') end,
                    case when (b->>'join_frozen_reason') is distinct from (pb->>'join_frozen_reason')
                         then 'السبب ' || coalesce(pb->>'join_frozen_reason','∅') || '→' || coalesce(b->>'join_frozen_reason','∅') end,
                    case when (b->>'accepts_waitlist') is distinct from (pb->>'accepts_waitlist')
                         then 'accepts_waitlist ' || (pb->>'accepts_waitlist') || '→' || (b->>'accepts_waitlist') end,
                    case when (b->>'max_waitlist_size') is distinct from (pb->>'max_waitlist_size')
                         then 'السقف ' || coalesce(pb->>'max_waitlist_size','∅') || '→' || coalesce(b->>'max_waitlist_size','∅') end,
                    case when (b->>'opening_hours') is distinct from (pb->>'opening_hours')
                         then 'ساعات العمل تغيّرت' end) as k
          from jsonb_array_elements(p_today->'branches') b
          join jsonb_array_elements(p_prev->'branches') pb
            on pb->>'branch_id' = b->>'branch_id') d
       where k not like '%: ';

      if v_fn_diff is not null then
        v_any := true;
        t := t || case when v_mig_changed then '• 🟡 ' else '• 🔴 بلا ترحيلٍ جديد: ' end
               || 'بصمات دوالّ تغيّرت: ' || v_fn_diff
               || case when v_mig_changed
                       then ' — ومعها ترحيلٌ جديد (' || (p_prev->'migrations'->>'count') || '→'
                            || (p_today->'migrations'->>'count') || ')، فالسبب معروف'
                       else ' — وعدد الترحيلات لم يتغيّر: تغيّرٌ دخل من خارج المسار الموثَّق' end || E'\n';
      end if;

      if v_struct_diff is not null then
        v_any := true;
        t := t || case when v_mig_changed then '• 🟡 ' else '• 🔴 بلا ترحيلٍ جديد: ' end
               || 'عدّادات البنية: ' || v_struct_diff || E'\n';
      end if;

      if v_flag_diff is not null then
        v_any := true;
        -- أعلام الفروع يغيّرها البشر والcron بالتصميم: تُذكر للعلم لا كإنذار
        t := t || '• ℹ️ أعلام فروعٍ تغيّرت (قرارٌ تشغيليّ أو cron الفجر): ' || v_flag_diff || E'\n';
      end if;

      if not v_any then
        t := t || '• لا انحراف — كلّ ما يجب أن يثبت ثابت' || E'\n';
      end if;
      t := t || E'\n' || 'ملحوظة: النشر (Vercel) خارج مدى هذه المقارنة — لا يصل القاعدة.' || E'\n';
    end;
  end if;

  -- ══════════ التقسيم على حدّ تلغرام ══════════
  -- على حدود الأسطر لا وسطها، وبلا حذف حرفٍ واحد.
  foreach ln in array string_to_array(t, E'\n') loop
    if length(buf) + length(ln) + 1 > LIMIT_CHARS then
      parts := parts || buf; buf := '';
    end if;
    buf := buf || ln || E'\n';
  end loop;
  if length(buf) > 0 then parts := parts || buf; end if;

  if array_length(parts, 1) > 1 then
    for i in 1 .. array_length(parts, 1) loop
      parts[i] := '(' || i || '/' || array_length(parts, 1) || ')' || E'\n' || parts[i];
    end loop;
  end if;

  return parts;
end;
$fn$;


-- ── ٥) مساعدان صافيان لقسمَي ٥ و٦ ───────────────────────────────────
--
-- «منذ متى»: آخر لقطةٍ لم يكن فيها هذا العلم. لا نقول «منذ يومين» ما لم
-- تشهد لقطةٌ محفوظة بذلك.
create or replace function public.report_since_label(p_key text, p_hist jsonb)
returns text language sql immutable set search_path to 'pg_temp' as $fn$
  select coalesce(
    (select 'ظهر بعد ' || (h->>'day_key') || ' (آخر يومٍ كان سليمًا فيه)'
       from jsonb_array_elements(p_hist) h
      where not exists (select 1 from jsonb_array_elements(h->'flags') f where f->>'key' = p_key)
      order by (h->>'day_key') desc limit 1),
    case when jsonb_array_length(p_hist) = 0
         then 'لا لقطات سابقة — أوّل تشغيل'
         else 'قائمٌ في كلّ اللقطات المحفوظة (' || jsonb_array_length(p_hist) || ' يومًا) — بدايته أقدم من مدى الحفظ' end);
$fn$;

-- «ما تغيّر في تلك النافذة»: الفرق البنيويّ بين آخر لقطةٍ سليمة واليوم.
create or replace function public.report_window_change(p_key text, p_today jsonb, p_hist jsonb)
returns text language plpgsql immutable set search_path to 'pg_temp' as $fn$
declare v_ok jsonb; v_out text := ''; v_fn text; v_st text;
begin
  select h into v_ok from jsonb_array_elements(p_hist) h
   where not exists (select 1 from jsonb_array_elements(h->'flags') f where f->>'key' = p_key)
   order by (h->>'day_key') desc limit 1;

  if v_ok is null then return 'لا لقطةً سليمة محفوظة لهذا البند — لا نافذة تُقارَن'; end if;

  if (p_today->'migrations'->>'count') is distinct from (v_ok->'migrations'->>'count') then
    v_out := v_out || 'ترحيلات ' || (v_ok->'migrations'->>'count') || '→' || (p_today->'migrations'->>'count')
          || ' (آخرها ' || (p_today->'migrations'->>'last') || ')؛ ';
  end if;

  select string_agg(key, '، ') into v_fn
    from jsonb_each_text(p_today->'fn_md5')
   where value is distinct from (v_ok->'fn_md5'->>key);
  if v_fn is not null then v_out := v_out || 'بصمات تغيّرت: ' || left(v_fn, 300) || '؛ '; end if;

  select string_agg(key || ' ' || (v_ok->'struct'->>key) || '→' || value, '، ') into v_st
    from jsonb_each_text(p_today->'struct')
   where value is distinct from (v_ok->'struct'->>key);
  if v_st is not null then v_out := v_out || 'البنية: ' || v_st || '؛ '; end if;

  if (p_today->'branches') is distinct from (v_ok->'branches') then
    v_out := v_out || 'أعلام فروعٍ تغيّرت؛ ';
  end if;

  return coalesce(nullif(v_out, ''), 'لا فرق بنيويًّا بين اللقطتين — السبب خارج البنية (نشر، شبكة، أو حِمل)');
end;
$fn$;


-- ── ٦) send_daily_report(): التقاط، بناء، إرسال ─────────────────────
create or replace function public.send_daily_report()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_id    bigint;
  v_today jsonb; v_prev jsonb; v_hist jsonb; v_day date;
  v_parts text[]; v_i int;
  v_have_cfg boolean;
begin
  v_id  := public.take_daily_snapshot();
  v_day := (now() at time zone 'Asia/Riyadh')::date;

  select payload into v_today from public.daily_snapshot where id = v_id;
  select payload into v_prev  from public.daily_snapshot
   where day_key < v_day order by day_key desc limit 1;

  -- التاريخ يُمرَّر مختصَرًا: القسمان ٥ و٦ يحتاجان الأعلام والبنية فقط،
  -- ولو مرّرنا الحمولة كاملة لكل ٩٠ يومًا لصار البناء ثقيلًا بلا فائدة.
  select coalesce(jsonb_agg(jsonb_build_object(
           'day_key', day_key, 'flags', payload->'flags',
           'migrations', payload->'migrations', 'struct', payload->'struct',
           'fn_md5', payload->'fn_md5', 'branches', payload->'branches')
         order by day_key desc), '[]'::jsonb)
    into v_hist
    from public.daily_snapshot where day_key < v_day;

  v_parts := public.daily_report_text(v_today, v_prev, v_hist);

  select (count(*) = 2) into v_have_cfg from public.alert_config
   where key in ('telegram_bot_token', 'telegram_chat_id') and value is not null;

  if not v_have_cfg then
    -- لا نمرّ صامتين: notify_telegram تعود بلا أثرٍ حين تغيب الإعدادات،
    -- فنسجّل نحن في alert_outbox بحالة failed كي يُرى الفشل لا يُبتلع.
    insert into public.alert_outbox (message, status, last_error, settled_at)
    values (array_to_string(v_parts, E'\n'), 'failed',
            'إعدادات تلغرام غائبة في alert_config — التقرير اليوميّ لم يُرسَل', now());
    update public.daily_snapshot
       set report_text = array_to_string(v_parts, E'\n'), parts = array_length(v_parts,1),
           send_status = 'failed', send_note = 'إعدادات تلغرام غائبة'
     where id = v_id;
    return jsonb_build_object('id', v_id, 'parts', array_length(v_parts,1), 'sent', false,
                              'why', 'إعدادات تلغرام غائبة');
  end if;

  for v_i in 1 .. array_length(v_parts, 1) loop
    -- notify_telegram تكتب في alert_outbox بنفسها، وsweep_alert_outbox
    -- يتابع التسليم ويعيد المحاولة — فلا حاجة لآليّةٍ ثانية هنا.
    perform public.notify_telegram(v_parts[v_i]);
  end loop;

  update public.daily_snapshot
     set report_text = array_to_string(v_parts, E'\n'), parts = array_length(v_parts,1),
         sent_at = now(), send_status = 'sent',
         send_note = array_length(v_parts,1) || ' رسالة — التسليم يتابعه sweep_alert_outbox'
   where id = v_id;

  return jsonb_build_object('id', v_id, 'parts', array_length(v_parts,1), 'sent', true);
end;
$fn$;

revoke all on function public.send_daily_report() from public, anon, authenticated;

comment on function public.send_daily_report() is
  'التقرير اليوميّ: يلتقط اللقطة، يبني النصّ، يرسله عبر notify_telegram مقسَّمًا إن لزم. لا يكتب إلا صفّ اللقطة وسجلّ الإرسال.';


-- ── ٧) الجدولة: ٠٧:٠٠ بالرياض = ٠٤:٠٠ UTC ───────────────────────────
select cron.unschedule('daily_platform_report')
 where exists (select 1 from cron.job where jobname = 'daily_platform_report');

select cron.schedule('daily_platform_report', '0 4 * * *', $$select public.send_daily_report();$$);


-- ── ٨) بصمة q20: تحديثُ مرجعٍ عمديّ لا إسكاتُ فحص ────────────────────
--
-- هذا الترحيل يضيف جدولًا واحدًا (daily_snapshot) وسبع دوالّ
-- (snapshot_payload، report_flags، take_daily_snapshot، daily_report_text،
--  report_since_label، report_window_change، send_daily_report).
-- فلولا هذا التصحيح لسقط q20_schema_no_drift لحظة التطبيق — كما سقط
-- بعد ٠١٦٩ بالضبط. والعدّادان الآخران لا يتحرّكان بالتصميم: الجدول بلا
-- سياسةٍ واحدة (RLS مشتغلة، لا سياسات) وبلا مفتاحٍ أجنبيّ.
--
-- والمراسي مطابقةٌ نصّيّة: إن لم تُطابق واحدةٌ منها ارتفع استثناءٌ وسقط
-- الترحيل كلّه — لا «نجاحٌ» صامتٌ يترك الفحص على رقمٍ قديم.
do $mig$
declare d text; d2 text;
begin
  select pg_get_functiondef(oid) into d
    from pg_proc where proname='run_critical_checks' and pronamespace='public'::regnamespace;
  if d is null then
    raise notice 'run_critical_checks غير موجودة في هذه القاعدة — لا بصمة تُحدَّث (المحاكاة)';
    return;
  end if;

  d2 := replace(d, 'where n.nspname=''public'' and c.relkind=''r'') = 34',
                   'where n.nspname=''public'' and c.relkind=''r'') = 35');
  if d2 = d then raise exception 'مرساة عدّاد الجداول (34) لم تُطابق'; end if;

  d := d2;
  d2 := replace(d, 'where n.nspname=''public'' and p.prokind=''f'') = 151',
                   'where n.nspname=''public'' and p.prokind=''f'') = 158');
  if d2 = d then raise exception 'مرساة عدّاد الدوالّ (151) لم تُطابق'; end if;

  execute d2;
end
$mig$;

-- المتوقَّع بعد التطبيق على الإنتاج:
--   q20 على 35 جدولًا · 158 دالّة · 73 سياسة · 43 مفتاحًا
--   ٢١٣/٢١٣ حرجة خضراء · ١٢/١٢ صحّة منصّة
