-- ═══ نفاية الطُّعم: ٨١٪ من جدول العملاء ليست عملاء ═══
--
-- العطل: مسبار الصحّة ينضمّ ضيفًا كلّ خمس دقائق ثمّ يلغي ويحذف **صفّ
-- الطابور وحده**. و`join_waitlist_guest` تُنشئ صفّ عميلٍ قبله، فيبقى.
-- والنتيجة قُيست لا قُدِّرت: ١١٧٦ صفًّا باسم «فحص آلي» من أصل ١٤٥٦.
--
-- ولماذا لم يُحذف من قبل: `queue_events.customer_id` قيدُه ON DELETE
-- **RESTRICT**، و`cancel_by_ticket` تكتب حدثًا لكلّ إلغاء. فحذفُ العميل
-- ساذجًا يسقط بـ23503. ولو أُضيف الحذف داخل كتلة الطُّعم لسقط في
-- `exception when others` فأعطى booking_writepath = false — أي إنذارًا
-- كاذبًا كلّ خمس دقائق. لذلك الترتيب هنا: الأحداث أوّلًا ثمّ العميل.
--
-- ══ لماذا وظيفةٌ مجدولة لا سطرٌ داخل المسبار ══
-- التنظيف عملُ صيانةٍ لا إشارةُ صحّة. فإن أخفق يجب أن يظهر في مكانٍ
-- يُقرأ، لا أن يُقلب مؤشّرَ «مسار الحجز» أحمرَ ولا أن يُبتلع صامتًا.
-- فصارت دالّةً مستقلّةً بجدولةٍ ساعيّة، وإخفاقُها يظهر في
-- cron.job_run_details وفي الحارس w57 ضمن الشبكة الحرجة.
--
-- ══ شروط الحذف — ما الذي يجعل صفًّا «طُعمًا» ══
-- أربعةٌ مجتمعة، لا واحدٌ منها:
--   full_name = 'فحص آلي'            الاسم الذي يمرّره المسبار حرفيًّا
--   user_id is null                   لا حسابَ مرتبطًا
--   phone ~ '^0?5[0-9]{8}$'           صيغة الهاتف المولَّد
--   ولا صفَّ طابورٍ ولا حجزًا يشير إليه
-- والشرط الأخير هو الفاصل الحقيقيّ: الضيف الحقيقيّ يبقى صفُّ طابوره
-- تاريخًا بعد خدمته، والطُّعم وحده يحذف صفَّه. فلو كتب ضيفٌ اسمه «فحص
-- آلي» صدفةً لبقي محميًّا بصفّ طابوره.
--
-- ══ ما قِيس قبل التطبيق (قراءةً فقط، بنفس شروط الحذف) ══
--   العملاء الآن                        ١٤٥٦
--   صفوفٌ ستُحذف                        ١١٧٦   ← لا صفَّ طُعمٍ يبقى محجوبًا
--   أحداثُ طابورٍ ستُحذف معها             ١٥٤   (كلّها kind='cancelled'
--                                              على system-canary-do-not-delete)
--   العملاء بعده                          ٢٨٠
--   صفوفٌ باسم «فحص آلي» ولها حسابٌ        ٠    ← لا حسابَ حقيقيًّا يُمسّ
--
-- ⚠ الحذف نهائيّ ولا يعيده التراجع ٠١٩٥. وهو مقبولٌ لأنّ الصفّ ليس بيانةَ
-- أحد: اسمٌ ثابتٌ يكتبه المسبار، وهاتفٌ عشوائيّ لا يخصّ شخصًا، وصفرُ
-- ارتباط. والتراجع يوقف السلوك لا يسترجع الماضي — وهذا مكتوبٌ فيه صراحةً.
--
-- التراجع: 0195_ROLLBACK_prune_canary_artifacts.sql (مكتوبٌ قبل هذا الملفّ)

create or replace function public.prune_canary_artifacts()
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_events int; v_cust int;
begin
  -- أوّلًا الأحداث: قيدُها RESTRICT فهي التي تمنع حذف العميل
  with doomed as (
    select c.id from public.customers c
     where c.full_name = 'فحص آلي'
       and c.user_id is null
       and c.phone ~ '^0?5[0-9]{8}$'
       and not exists (select 1 from public.waitlist_entries w where w.customer_id = c.id)
       and not exists (select 1 from public.reservations  r where r.customer_id = c.id)
  )
  delete from public.queue_events q using doomed d where q.customer_id = d.id;
  get diagnostics v_events = row_count;

  -- ثمّ العميل — وشرطُ خلوّه من الأحداث مُعادٌ هنا لا مفترَضًا
  delete from public.customers c
   where c.full_name = 'فحص آلي'
     and c.user_id is null
     and c.phone ~ '^0?5[0-9]{8}$'
     and not exists (select 1 from public.waitlist_entries w where w.customer_id = c.id)
     and not exists (select 1 from public.reservations  r where r.customer_id = c.id)
     and not exists (select 1 from public.queue_events  q where q.customer_id = c.id);
  get diagnostics v_cust = row_count;

  return jsonb_build_object('events_pruned', v_events, 'customers_pruned', v_cust);
end $function$;

revoke all on function public.prune_canary_artifacts() from public, anon, authenticated;

comment on function public.prune_canary_artifacts() is
  'تنظيف أثر مسبار الصحّة: أحداثُ طابوره ثمّ صفوفُ عملائه («فحص آلي» بلا حسابٍ ولا طابورٍ ولا حجز). مدخل cron وحده.';

-- الجدولة ساعيّة: المسبار ينتج ~١٢ صفًّا في الساعة، فالتراكم يبقى بحجم
-- ساعةٍ واحدة لا يومٍ كامل. والدقيقة ٢٥ بعيدةٌ عن نبضات :00 و:05 و:15.
select cron.unschedule('prune-canary-artifacts')
 where exists (select 1 from cron.job where jobname = 'prune-canary-artifacts');
select cron.schedule('prune-canary-artifacts', '25 * * * *', $$select public.prune_canary_artifacts();$$);

-- التنظيف الأوّل — الآن، داخل هذه المعاملة، لا انتظارًا لأوّل جدولة
do $backfill$
declare v jsonb;
begin
  v := public.prune_canary_artifacts();
  raise notice 'التنظيف الأوّل: %', v::text;
  if (v->>'customers_pruned')::int < 1000 then
    raise exception 'التنظيف حذف % صفًّا فقط — كان المقيس ١١٧٦؛ الشروط لم تعد تطابق الواقع',
      (v->>'customers_pruned');
  end if;
end $backfill$;

-- q20: دالّةٌ واحدة جديدة  140 → 141
do $mig$
declare d text; d2 text;
begin
  select pg_get_functiondef(oid) into d from pg_proc
   where proname='run_critical_checks' and pronamespace='public'::regnamespace;
  d2 := replace(d, 'and p.prokind=''f'') = 140', 'and p.prokind=''f'') = 141');
  if d2 = d then raise exception 'مرساة عدّاد الدوالّ (140) لم تُطابق'; end if;
  execute d2;
end $mig$;

-- حارسٌ دائم w57: الجدولة قائمة، والتراكم محدود. وهو الذي يصرخ إن
-- توقّف التنظيف — بدل أن يُبتلع الإخفاق أو يُقلب مؤشّر الحجز أحمر.
do $mig2$
declare d text; d2 text; v_new text;
begin
  select pg_get_functiondef(oid) into d from pg_proc
   where proname='run_critical_checks' and pronamespace='public'::regnamespace;

  v_new :=
       E'    (''w57_canary_artifacts_bounded'',\n'
    || E'       exists (select 1 from cron.job where jobname = ''prune-canary-artifacts'' and active)\n'
    || E'       and (select count(*) from public.customers\n'
    || E'             where full_name = ''فحص آلي'' and user_id is null) <= 300),\n';

  d2 := replace(d, E'    (''q20_schema_no_drift'',', v_new || E'    (''q20_schema_no_drift'',');
  if d2 = d then raise exception 'مرساة q20 لم تُطابق'; end if;
  execute d2;
end $mig2$;

-- تحقّقٌ بعديّ داخل المعاملة نفسها
do $verify$
declare v_fail text; v_w57 boolean; v_left int; v_real int; v_h jsonb;
begin
  select count(*) into v_left from public.customers
   where full_name = 'فحص آلي' and user_id is null;
  if v_left <> 0 then raise exception 'بقي % صفَّ طُعمٍ بعد التنظيف', v_left; end if;

  select count(*) into v_real from public.customers;
  if v_real < 200 then raise exception 'العملاء بعد التنظيف % — أقلّ من المتوقَّع، حُذف ما لا ينبغي', v_real; end if;

  select pass into v_w57 from public.run_critical_checks() where name='w57_canary_artifacts_bounded';
  if v_w57 is null then raise exception 'w57 لم يُضف'; end if;
  if not v_w57 then raise exception 'w57 راسب فور إضافته'; end if;

  -- المسبار نفسه ما زال يعمل بعد حذف تاريخه
  v_h := public.check_platform_health();
  if (v_h->'booking_writepath'->>'ok')::boolean is not true then
    raise exception 'مسار الحجز راسبٌ بعد التنظيف: %', (v_h->'booking_writepath')::text;
  end if;

  select coalesce(string_agg(name,'، ') filter (where not pass),'—') into v_fail
    from public.run_critical_checks();
  if v_fail <> '—' then raise exception 'فحوصٌ راسبة: %', v_fail; end if;
end
$verify$;
