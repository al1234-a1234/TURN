-- ============================================================================
--  محرّك التنبيه — من «أسأل نفسي» إلى «أقرأ ما وقع لإنسان».
--
--  ── ما يتغيّر ──
--  المحرّك كان يقرأ `check_platform_health()` باثنتي عشرة إشارة، عشرٌ منها
--  مسابيرُ اصطناعيّة تكتب على مستأجرٍ وهميّ أو تقيس نفسها. فأنتج ٢٨ رسالة
--  تقلّب في ٣٦ ساعة، لا عطلَ حقيقيًّا واحدًا بينها مسّ عميلًا. صار يقرأ
--  `collect_alert_signals()` بأربع إشاراتٍ كلُّها من أثرٍ حقيقيّ.
--
--  ── والأهمّ: متى يُشترط التكرار ومتى لا ──
--  الاشتراط الأعمى لنبضتين يؤخّر كلّ شيءٍ خمس دقائق بلا مقابل. فالفرق هنا
--  بين **قياسٍ** و**سجلّ**:
--
--    قياسٌ قد يتقلّب (استعلامٌ عالق) ⇒ نبضتان متتاليتان قبل الإرسال.
--    سجلٌّ وقع ودُوّن (خطأ ٥٠٠ · فشل انضمام) ⇒ فورًا. النبضة الثانية لا
--      تضيف يقينًا؛ الصفّ مكتوبٌ في القاعدة ولن يتغيّر.
--    حالةُ فهرسٍ لا تتحرّك (انحدار الصلاحيات) ⇒ فورًا. لا سطحَ تقلّبٍ فيها
--      أصلًا: لا شبكة ولا مهلة ولا توقيت.
--
--  فـ`needs_streak` خاصّيةٌ لكلّ إشارةٍ لا قاعدةٌ عامّة.
--
--  ── الرسائل بلغةٍ يقرؤها غير المبرمج ──
--  «ما الذي تعطّل · أيّ مطعم أو فرع · منذ متى». لا اسمَ دالّةٍ ولا رمزَ خطأ
--  بلا ترجمةٍ بجانبه. والقديمة كانت تُلصق `jsonb` خامًا في نصّ الرسالة.
--
--  ── ما لا يشمله هذا الترحيل، وأقوله صراحةً ──
--  البنود ٤ و٥ و٦ و٧ و٩ باقيةٌ على دوالّها الحاليّة بلا تغيير
--  (`alert_position_duplicates` · `alert_peak_join_stall` ·
--  `alert_closed_branch_with_waiters` · فحص كرون `expire-stale` وحده).
--  تُعاد صياغتها في الزوج الرابع. وانقطاعُ القاعدة كلّيًّا لا يُرصد من
--  داخلها بحكم التعريف — موضعُه الحارس الخارجيّ في GitHub Actions.
--
--  ── والمصرف فارغٌ اليوم ──
--  الإشارتان ١ و٢ تقرآن `failure_events`، ولا كاتبَ لها بعد. فتبقيان
--  خضراوين حتى يُشحن `instrumentation.ts` و`actions.ts` في الزوج التالي.
--  هذا مقصود: المحرّك يسبق الكاتب كي لا يُشحن كاتبٌ بلا قارئ.
-- ============================================================================

alter table public.alert_state
  add column if not exists fail_streak int not null default 0;

alter table public.alert_state
  add column if not exists last_scope text;

comment on column public.alert_state.fail_streak is
  'عدد النبضات الفاشلة المتتالية. يُصفَّر عند أوّل نجاح. تستعمله الإشارات القياسيّة وحدها (needs_streak).';

-- الموضع لحظةَ الإنذار. رسالةُ التعافي تحتاجه وقد زال من الإشارة: الإشارة
-- صارت نظيفة فلا اسمَ مطعمٍ فيها. وبدونه تقول «عاد يعمل — الموضع: —»
-- ولا يعرف المالك أيّ مطعمٍ تعافى، وهو نصف الخبر.
comment on column public.alert_state.last_scope is
  'الموضع (مطعم/فرع/مسار) كما كان لحظة الإنذار، ليُذكر في رسالة التعافي.';

-- ── جامع الإشارات ─────────────────────────────────────────────────────────
create or replace function public.collect_alert_signals()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_5xx_n int; v_5xx_paths text; v_5xx_since timestamptz;
  v_join_n int; v_join_where text; v_join_since timestamptz;
  v_stuck_n int; v_stuck_secs int;
  v_drift jsonb; v_drift_detail text;
begin
  -- (١) صفحةٌ لم تفتح لزائرٍ حقيقيّ — ٥٠٠ خادميّ مسجَّل، لا مسبار.
  select count(*), string_agg(distinct path, '، '), min(at)
    into v_5xx_n, v_5xx_paths, v_5xx_since
    from public.failure_events
   where kind = 'page_5xx' and at > now() - interval '15 minutes';

  -- (٢) عميلٌ حقيقيّ لم يستطع أخذ دوره — بعد استبعاد الرفض المشروع
  --     (ممتلئ · مغلق · بلا انتظار · محاولات كثيرة) عند الكاتب.
  select count(*), string_agg(distinct coalesce(r.name, 'فرعٌ غير معروف'), '، '), min(f.at)
    into v_join_n, v_join_where, v_join_since
    from public.failure_events f
    left join public.branches b    on b.id = f.branch_id
    left join public.restaurants r on r.id = b.restaurant_id
   where f.kind = 'join_failed' and f.at > now() - interval '15 minutes';

  -- (٣) استعلامُ تطبيقٍ حقيقيّ عالق.
  --     `backend_type = 'client backend'` يستبعد بدقّة ما طلب المالك
  --     استبعاده: autovacuum وcheckpointer وعامل pg_net ومُطلق النسخ
  --     المنطقيّ — وكلّها ليست backends عميل. والقديم لم يُرشِّح بها
  --     إطلاقًا فكان يعدّ autovacuum عطلًا.
  --     ويستبعد نفسه: خلفيّةُ الكرون نصُّها `select send_platform_alerts()`
  --     والقديم كان يرصدها ثمّ يُنذر عنها.
  select count(*), coalesce(max(round(extract(epoch from (now() - query_start)))), 0)
    into v_stuck_n, v_stuck_secs
    from pg_stat_activity
   where state = 'active'
     and backend_type = 'client backend'
     and pid <> pg_backend_pid()
     and now() - query_start > interval '2 minutes'
     and query not ilike '%pg_stat_activity%'
     and query not ilike 'START_REPLICATION%'
     and query not ilike '%send_platform_alerts%'
     and query not ilike '%collect_alert_signals%'
     and query not ilike '%check_platform_health%';

  -- (٨) انحدار الصلاحيات — البند الثامن، يُربط بالإرسال هنا.
  v_drift := public.check_permission_drift();
  v_drift_detail := concat_ws(' · ',
    nullif('جداول بلا حماية: ' || coalesce(v_drift->'tables_missing_rls'->>'names',''), 'جداول بلا حماية: '),
    nullif('دوالّ بمسارٍ غير مثبَّت: ' || coalesce(v_drift->'secdef_without_search_path'->>'names',''), 'دوالّ بمسارٍ غير مثبَّت: '),
    nullif('صلاحيّات زائدة للزائر: ' || coalesce(v_drift->'anon_beyond_allowlist'->>'names',''), 'صلاحيّات زائدة للزائر: ')
  );

  return jsonb_build_object('signals', jsonb_build_array(

    jsonb_build_object(
      'key','real_page_errors', 'ok', (v_5xx_n = 0), 'needs_streak', false,
      'label','صفحةٌ لم تفتح لزائرٍ حقيقيّ',
      'scope', coalesce(v_5xx_paths, '—'),
      'since', v_5xx_since,
      'detail', v_5xx_n || ' خطأ خلال آخر ربع ساعة'),

    jsonb_build_object(
      'key','real_join_failures', 'ok', (v_join_n = 0), 'needs_streak', false,
      'label','عميلٌ حاول يأخذ دوره وما نجح',
      'scope', coalesce(v_join_where, '—'),
      'since', v_join_since,
      'detail', v_join_n || ' محاولة فاشلة خلال آخر ربع ساعة'),

    jsonb_build_object(
      'key','stuck_db_query', 'ok', (v_stuck_n = 0), 'needs_streak', true,
      'label','القاعدة فيها عمليّة واقفة تعطّل غيرها',
      'scope','قاعدة البيانات',
      'since', null,
      'detail', v_stuck_n || ' عمليّة، أطولها ' || v_stuck_secs || ' ثانية'),

    jsonb_build_object(
      'key','permission_drift', 'ok', (v_drift->>'ok')::boolean, 'needs_streak', false,
      'label','تغيّرت صلاحيّات القاعدة — احتمال انكشاف بيانات',
      'scope','المنصّة كلّها',
      'since', null,
      'detail', coalesce(nullif(v_drift_detail, ''), 'راجع check_permission_drift() للتفصيل'))
  ));
end;
$function$;

revoke all on function public.collect_alert_signals() from public, anon, authenticated;

-- ── المحرّك ───────────────────────────────────────────────────────────────
create or replace function public.send_platform_alerts()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_token text; v_chat_id text;
  s jsonb;
  v_ok boolean; v_need boolean;
  v_prev boolean; v_streak int; v_scope text;
  v_msg text; v_since text;
begin
  select value into v_token   from public.alert_config where key = 'telegram_bot_token';
  select value into v_chat_id from public.alert_config where key = 'telegram_chat_id';
  if v_token is null or v_chat_id is null then return; end if;

  for s in select * from jsonb_array_elements(public.collect_alert_signals() -> 'signals') loop
    v_ok   := (s->>'ok')::boolean;
    v_need := coalesce((s->>'needs_streak')::boolean, false);

    select is_failing, fail_streak, last_scope into v_prev, v_streak, v_scope
      from public.alert_state where check_key = (s->>'key');
    v_prev   := coalesce(v_prev, false);
    v_streak := coalesce(v_streak, 0);

    if not v_ok then
      v_streak := v_streak + 1;

      -- إشارةٌ قياسيّة تحتاج نبضتين؛ وسجلٌّ أو حالةُ فهرسٍ تُرسل من الأولى.
      if not v_prev and v_streak >= (case when v_need then 2 else 1 end) then
        v_since := case
                     when s->>'since' is null then 'الآن'
                     else to_char((s->>'since')::timestamptz at time zone 'Asia/Riyadh',
                                  'YYYY-MM-DD HH24:MI')
                   end;

        v_msg := '🔴 دور — ' || (s->>'label') || E'\n'
              || 'الموضع: '  || (s->>'scope') || E'\n'
              || 'منذ: '     || v_since       || ' (بتوقيت الرياض)' || E'\n'
              || (s->>'detail');

        perform public.notify_telegram(v_msg);

        insert into public.alert_state (check_key, is_failing, fail_streak, last_scope, last_changed_at, last_message)
        values (s->>'key', true, v_streak, s->>'scope', now(), v_msg)
        on conflict (check_key) do update
          set is_failing = true, fail_streak = excluded.fail_streak,
              last_scope = excluded.last_scope,
              last_changed_at = now(), last_message = excluded.last_message;
      else
        -- تحديث العدّاد بلا إرسال: إمّا ننتظر النبضة الثانية، وإمّا نحن
        -- منذرون أصلًا فلا نكرّر الرسالة نفسها كلّ خمس دقائق.
        insert into public.alert_state (check_key, is_failing, fail_streak, last_changed_at)
        values (s->>'key', v_prev, v_streak, now())
        on conflict (check_key) do update set fail_streak = excluded.fail_streak;
      end if;

    else
      if v_prev then
        -- الموضع من لحظة الإنذار لا من الآن: الإشارة صارت نظيفة فلا موضعَ
        -- فيها، ورسالةٌ تقول «عاد يعمل — الموضع: —» تحجب نصف الخبر.
        v_msg := '✅ دور — عاد يعمل: ' || (s->>'label') || E'\n'
              || 'الموضع: ' || coalesce(nullif(v_scope, '—'), s->>'scope') || E'\n'
              || 'الوقت: '  || to_char(now() at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI')
              || ' (بتوقيت الرياض)';

        perform public.notify_telegram(v_msg);

        insert into public.alert_state (check_key, is_failing, fail_streak, last_changed_at, last_message)
        values (s->>'key', false, 0, now(), v_msg)
        on conflict (check_key) do update
          set is_failing = false, fail_streak = 0,
              last_changed_at = now(), last_message = excluded.last_message;
      else
        -- سليمٌ وكان سليمًا: نصفّر العدّاد وحده كي لا تتراكم نبضاتٌ
        -- متفرّقة عبر ساعاتٍ فتُقرأ تتاليًا وهي ليست كذلك.
        update public.alert_state set fail_streak = 0
         where check_key = (s->>'key') and fail_streak <> 0;
      end if;
    end if;
  end loop;
end;
$function$;

-- حارسٌ بنيويّ: يمنع أن يعود المحرّك خِلسةً إلى قراءة المسابير الاصطناعيّة.
-- وعدّاد الدوالّ يُرفع معه: ١٤٥ ← ١٤٦ (collect_alert_signals وحدها).
do $mig$
declare v_def text; v_before text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='run_critical_checks';
  if v_def is null then raise exception 'run_critical_checks غير موجودة'; end if;

  v_before := v_def;

  if position('w31_alerts_read_real_signals' in v_def) = 0 then
    v_def := replace(v_def, E'    (\'w30_no_permission_drift\',',
        E'    (\'w31_alerts_read_real_signals\', (select pg_get_functiondef(oid) like \'%collect_alert_signals%\'\n'
     || E'                                        from pg_proc where proname=\'send_platform_alerts\')),\n'
     || E'    (\'w30_no_permission_drift\',');
  end if;

  v_def := replace(v_def, E'and p.prokind=\'f\') = 145', E'and p.prokind=\'f\') = 146');

  if v_def = v_before then
    raise exception 'لم يُطابَق مرتكز w30 ولا عدّاد ١٤٥ — راجع الحالة قبل المتابعة';
  end if;

  execute v_def;
end
$mig$;
