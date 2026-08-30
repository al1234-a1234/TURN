-- ============================================================================
--  سجلّ الدفع يسمّي الاشتراك — سطرٌ واحد يجعل الفشل قابلًا للقياس.
--
--  ⛔ غير مطبَّق. ينتظر إذن المالك الصريح.
--
--  ── العطب ──
--  `log_push_sends` تكتب في `payload` مضيفًا فقط: `{"host": "…"}`. فحين رأينا
--  اثني عشر `VapidPkHashMismatch` عرفنا **أنّ** اشتراكًا مسمومٌ ولم نستطع
--  **تسميته** — والاثنا عشر كلّها من عميلٍ يملك خمسة اشتراكات. تشخيصٌ بلا
--  مُتَّهَم، وإصلاحٌ آليٌّ ممتنعٌ من أصله.
--
--  ── ولماذا مُعرّف الاشتراك لا النقطة نفسها ──
--  الطلب كان «حفظ النقطة». والنقطة عنوانٌ يخصّ جهاز عميلٍ بعينه، و
--  `notifications` يقرؤها **موظّفو المطعم** (سياسة «staff reads notifications»
--  على فروعهم). فحفظها يضع في يد كلّ مضيفٍ معرّفًا دائمًا لجوّال كلّ زبون —
--  ثمنٌ لا يشتري شيئًا: `push_subscriptions.id` يسمّي الصفّ بدقّةٍ تامّة،
--  والوصل موجودٌ سلفًا في الدالّة (`join push_subscriptions s`). فائدةٌ كاملة
--  بلا تسريب. وهو المعنى نفسه الذي طُلب، بمفتاحٍ داخليٍّ بدل عنوانٍ خارجيّ.
--
--  ── ما لم يُغيَّر عمدًا ──
--  `join lateral` على `waitlist_entries` وصلٌ داخليّ: عميلٌ بلا دورٍ قطّ
--  يسقط سطره بصمت. تحويله إلى `left join` يقتضي أن يقبل `notifications.branch_id`
--  العدم، وهو `NOT NULL` اليوم — تغييرُ مخطّطٍ لا سطران. أُخِّر لبندٍ مستقلّ
--  كما اتُّفق، وهو مسجَّل في ops/incidents/2026-08-30-push-vapid-key-mismatch.md.
--
--  ── الفرق عن السابق: `jsonb_build_object` وحده. لا شيء آخر. ──
-- ============================================================================

create or replace function public.log_push_sends(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_count integer;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return 0;
  end if;

  with rows_in as (
    select r->>'endpoint'  as endpoint,
           r->>'template'  as template,
           (r->>'delivered')::boolean as delivered,
           nullif(r->>'error', '') as err
    from jsonb_array_elements(p_rows) r
  )
  insert into public.notifications
    (branch_id, customer_id, channel, template, payload, sent_at, delivered, error)
  select w.branch_id,
         s.customer_id,
         'push'::public.notification_channel,
         coalesce(ri.template, 'queue'),
         jsonb_build_object(
           'host', split_part(split_part(ri.endpoint, '//', 2), '/', 1),
           'sub',  s.id            -- ← الإضافة: أيُّ اشتراكٍ بالضبط
         ),
         now(),
         ri.delivered,
         left(ri.err, 300)
  from rows_in ri
  join public.push_subscriptions s on s.endpoint = ri.endpoint
  join lateral (
    select w2.branch_id
    from public.waitlist_entries w2
    where w2.customer_id = s.customer_id
    order by (w2.status in ('waiting', 'notified')) desc, w2.joined_at desc
    limit 1
  ) w on true;

  get diagnostics v_count = row_count;
  return v_count;
end
$function$;

-- حارس: العمود الذي يجعل الفشل قابلًا للنسبة يستحقّ فحصًا. ولا يُقاس على
-- الجدول (قد يكون فارغًا) بل على نصّ الدالّة نفسها — الفحص على الجدول
-- «أخضرُ لأنّه لم يعمل»، وهو بالضبط ما نطارده.
do $mig$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='run_critical_checks';
  if v_def is null then raise exception 'run_critical_checks غير موجودة'; end if;

  if position('w28_push_log_names_sub' in v_def) = 0 then
    v_def := replace(v_def, E'    (\'q20_schema_no_drift\',',
      E'    (\'w28_push_log_names_sub\', (select pg_get_functiondef(oid) like \'%\'\'sub\'\',  s.id%\'\n'
   || E'                                  from pg_proc where proname=\'log_push_sends\')),\n'
   || E'    (\'q20_schema_no_drift\',');
  end if;

  execute v_def;
end
$mig$;

-- ملاحظة: `create or replace` لا يُنشئ دالّةً جديدة ولا يُسقط صلاحية
-- (خلافًا لـDROP+CREATE) ⇒ q20_schema_no_drift لا يتحرّك، و`push_log_server_only`
-- يبقى أخضر. يُتحقَّق منهما بالتشغيل لا بالظنّ.
