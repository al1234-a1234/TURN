-- ═══ تبديل موضعَي دورين — لا إعادة ترتيب ═══
--
-- الحاجة من الميدان: صاحب الدور ٣ يُنادى فيقول «أمهلوني»، فيبدّله الاستقبال
-- مع صاحب الدور ٦. الثالث يصير سادسًا والسادس ثالثًا، **ولا يُمسّ أحدٌ غيرهما**.
--
-- تبديلُ موضعين اثنين لا إعادةَ ترقيمٍ للطابور. لا إزاحةَ لأحد، ولا تحريكَ
-- إلى «الموضع رقم كذا»، ولا سحبَ وإفلات.
--
-- ولا إشعارَ البتّة: لا تلغرام ولا دفع ولا رسالة. قرارُ المالك صريحٌ فيه.
--
-- ══ ما يجعل هذا آمنًا — وهو مربط الفرس ══
-- الرقم الذي يراه الضيف **ليس** العمود `position`. دالّة التذكرة تحسبه:
--     ahead = عدد الأحياء في نفس (الفرع، القسم) بموضعٍ أصغر
--     position المعروض = ahead + 1
-- فالحقلان مشتقّان من استعلامٍ واحد، فلا يمكن أن يتناقضا بنيويًّا.
--
-- وحين يتبادل صفّان قيمتَي موضعهما، تبقى **مجموعةُ المواضع في القسم كما هي
-- حرفيًّا** — تغيّر فقط أيُّ صفٍّ يحمل أيَّ قيمة. فلأيّ ضيفٍ ثالثٍ موضعُه P،
-- عددُ المواضع الأصغر من P قبل التبديل = عددُها بعده. أي أنّ ثباتَ بقيّة
-- الطابور **نتيجةٌ رياضيّة لا رجاء**. ومع ذلك أُثبت بالفرق قبل/بعد في كلّ
-- حالة اختبار، لا بالاستنتاج وحده.
--
-- ══ لماذا داخل القسم الواحد فقط ══
-- هذا ليس حدًّا على المسافة — أيّ بعدٍ داخل القسم يعمل: ٣↔٧، ٢↔١٨، ١↔٢٠.
-- لكنّ التبديل عبر قسمين يغيّر مجموعةَ المواضع في القسمين معًا، فيرى ضيوفٌ
-- آخرون أرقامَهم تتغيّر — وهو بالضبط ما نهى عنه المالك. وقد يصطدم بقيد
-- EXCLUDE فيسقط. والقاعدة فيها فعلًا أقسام (inside/outside/any). فالرفض هنا
-- تقنيٌّ يفرضه ضمانُ «لا يتغيّر رقم أحدٍ غيرهما»، لا سياسةٌ اخترعناها.
--
-- ══ القيد لا يحتاج قيمةً وسيطة ══
-- waitlist_live_pos_unique هو EXCLUDE … DEFERRABLE **INITIALLY DEFERRED**
-- (تحقّقٌ من pg_constraint: condeferrable=t، condeferred=t). فالفحص يقع عند
-- الإيداع لا عند كلّ جملة، والتبديل المباشر A=B ثمّ B=A يمرّ سليمًا.
-- **فلا قيمةَ وسيطة (sentinel) أصلًا** — ولذلك لا يمكن أن يراها قارئ: لا
-- وجودَ لها. وهذا أقوى من إخفائها داخل المعاملة.
--
-- ══ المحفّزات على تعديل الموضع وحده ══
-- فُحصت كلّها: الذي يُطلق هو `touch_updated_at` فقط. أمّا set_waitlist_position
-- وenforce_branch_queue_cap وenforce_platform_open فعلى INSERT وحده،
-- وguard_waitlist_status وlog_queue_event وon_waitlist_status_change على
-- UPDATE OF status، وenforce_zone_belongs على UPDATE OF zone, branch_id.
-- ونحن لا نمسّ status ولا zone ولا branch_id.
--
-- ══ القفل ══
-- الصفّان يُقفلان FOR UPDATE بترتيبٍ حتميّ تصاعديًّا بالمعرّف، فلا جمود
-- (deadlock) لو بدّل موظّفان زوجين متقاطعين في اللحظة نفسها.
--
-- ══ الأثر ══
-- queue_events نوعٌ جديد 'swapped' يحمل المعرّفين والموضعين قبل وبعد.
-- أفعالُ الطابور مؤرَّشةٌ في هذه المنصّة، فلا يصحّ أن يكون هذا الفعل أعمى.
--
-- التراجع: 0199_ROLLBACK_swap_queue_positions.sql (مكتوبٌ قبل هذا الملفّ)

-- ٠) خطُّ الأساس: ما هو راسبٌ قبل أن نلمس شيئًا (w23 أحمرُ لسببٍ بشريّ:
--    ساعات عمل Eficto ٢١ ساعة/يوم. نتسامح معه، ونسقط على أيّ أحمرَ جديد.)
create temporary table if not exists _pre_fail on commit drop as
  select name from public.run_critical_checks() where not pass;

-- ١) نوع الحدث الجديد
alter table public.queue_events drop constraint queue_events_kind_check;
alter table public.queue_events add constraint queue_events_kind_check
  check (kind = any (array['notified'::text, 'seated'::text, 'cancelled'::text,
                           'expired'::text, 'no_show'::text, 'restored'::text,
                           'moved'::text, 'swapped'::text]));

-- ٢) الدالّة
create or replace function public.swap_queue_positions(p_a uuid, p_b uuid)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
  v_first uuid; v_second uuid;
  a_id uuid; a_branch uuid; a_zone text; a_status public.waitlist_status; a_pos int; a_cust uuid;
  b_id uuid; b_branch uuid; b_zone text; b_status public.waitlist_status; b_pos int; b_cust uuid;
begin
  if p_a is null or p_b is null or p_a = p_b then
    raise exception 'اختر دورين مختلفين' using errcode = 'P0400';
  end if;

  -- ترتيبٌ حتميّ للقفل: تصاعديًّا بالمعرّف. لو قفل موظّفان زوجين متقاطعين
  -- بترتيبين مختلفين لحدث جمود؛ وبهذا الترتيب ينتظر أحدهما الآخر ويمرّان.
  v_first  := least(p_a, p_b);
  v_second := greatest(p_a, p_b);

  select id, branch_id, zone, status, "position", customer_id
    into a_id, a_branch, a_zone, a_status, a_pos, a_cust
    from public.waitlist_entries where id = v_first for update;
  if not found then
    raise exception 'أحد الدورين غير موجود' using errcode = 'P0404';
  end if;

  select id, branch_id, zone, status, "position", customer_id
    into b_id, b_branch, b_zone, b_status, b_pos, b_cust
    from public.waitlist_entries where id = v_second for update;
  if not found then
    raise exception 'أحد الدورين غير موجود' using errcode = 'P0404';
  end if;

  if a_branch <> b_branch then
    raise exception 'الدوران في فرعين مختلفين' using errcode = 'P0409';
  end if;

  -- الصلاحية بخريطة الصلاحيات لا بالعضويّة وحدها — العضويّة وحدها كانت
  -- عطل HIGH-1 بعينه.
  if not (public.is_platform_admin()
          or a_branch = any (coalesce(public.my_branch_ids_for('waitlist'), array[]::uuid[]))) then
    raise exception 'غير مخوّل' using errcode = '42501';
  end if;

  if a_status not in ('waiting','notified') or b_status not in ('waiting','notified') then
    raise exception 'لا يُبدَّل دورٌ خرج من الطابور' using errcode = 'P0412';
  end if;

  if a_zone is distinct from b_zone then
    raise exception 'الدوران في قسمين مختلفين — التبديل داخل القسم الواحد'
      using errcode = 'P0409';
  end if;

  -- التبديل المباشر: القيد مؤجَّلٌ إلى الإيداع فلا حاجة لقيمةٍ وسيطة.
  update public.waitlist_entries set "position" = b_pos where id = a_id;
  update public.waitlist_entries set "position" = a_pos where id = b_id;

  insert into public.queue_events
    (branch_id, entry_id, customer_id, kind, zone, from_rank, to_rank, actor, detail)
  values
    (a_branch, a_id, a_cust, 'swapped', a_zone, a_pos, b_pos, (select auth.uid()),
     jsonb_build_object(
       'a', jsonb_build_object('entry', a_id, 'from', a_pos, 'to', b_pos),
       'b', jsonb_build_object('entry', b_id, 'from', b_pos, 'to', a_pos)));

  return jsonb_build_object(
    'ok', true,
    'a', jsonb_build_object('entry', a_id, 'from', a_pos, 'to', b_pos),
    'b', jsonb_build_object('entry', b_id, 'from', b_pos, 'to', a_pos));
end $function$;

-- الاستقبال ينادي بجلسة الموظّف ⇒ authenticated تبقى. وanon تُنزَع صراحةً
-- لا اتّكالًا على الحارس w47.
revoke all on function public.swap_queue_positions(uuid, uuid) from public, anon;

comment on function public.swap_queue_positions(uuid, uuid) is
  'تبديل موضعَي دورين حيّين في نفس الفرع ونفس القسم. لا إعادة ترقيم، ولا إشعار، ولا حدَّ للمسافة. مدخل الاستقبال.';

-- ٣) q20: دالّةٌ واحدة جديدة  142 → 143
do $mig2$
declare d text; d2 text;
begin
  select pg_get_functiondef(oid) into d from pg_proc
   where proname='run_critical_checks' and pronamespace='public'::regnamespace;
  d2 := replace(d, 'and p.prokind=''f'') = 142', 'and p.prokind=''f'') = 143');
  if d2 = d then raise exception 'مرساة عدّاد الدوالّ (142) لم تُطابق'; end if;
  execute d2;
end $mig2$;

-- ٤) حارسٌ دائم w59: لا تُكشف الدالّة لـanon، ولا يسقط شرطُ الصلاحية
--    المخرَّطة ولا شرطُ القسم الواحد.
do $mig3$
declare d text; d2 text; v_new text;
begin
  select pg_get_functiondef(oid) into d from pg_proc
   where proname='run_critical_checks' and pronamespace='public'::regnamespace;

  v_new :=
       E'    (''w59_swap_is_sealed_and_zone_safe'',\n'
    || E'       not has_function_privilege(''anon'', ''public.swap_queue_positions(uuid,uuid)'', ''EXECUTE'')\n'
    || E'       and (select position(''my_branch_ids_for'' in pg_get_functiondef(oid)) > 0\n'
    || E'               and position(''zone is distinct from'' in pg_get_functiondef(oid)) > 0\n'
    || E'              from pg_proc where proname=''swap_queue_positions''\n'
    || E'               and pronamespace=''public''::regnamespace)),\n';

  d2 := replace(d, E'    (''q20_schema_no_drift'',', v_new || E'    (''q20_schema_no_drift'',');
  if d2 = d then raise exception 'مرساة q20 لم تُطابق'; end if;
  execute d2;
end $mig3$;

-- ٥) تحقّقٌ بعديّ
do $verify$
declare v_new_fail text; v_w59 boolean; v_anon boolean; v_auth boolean; v_dup int;
begin
  select has_function_privilege('anon','public.swap_queue_positions(uuid,uuid)','EXECUTE') into v_anon;
  if v_anon then raise exception 'الدالّة مكشوفةٌ لـanon'; end if;

  select has_function_privilege('authenticated','public.swap_queue_positions(uuid,uuid)','EXECUTE') into v_auth;
  if not v_auth then raise exception 'authenticated لا تستطيع النداء — الاستقبال سيتعطّل'; end if;

  select pass into v_w59 from public.run_critical_checks()
   where name='w59_swap_is_sealed_and_zone_safe';
  if v_w59 is null then raise exception 'w59 لم يُضف'; end if;
  if not v_w59 then raise exception 'w59 راسب فور إضافته'; end if;

  select count(*) into v_dup from (
    select 1 from public.waitlist_entries
     where status in ('waiting','notified')
     group by branch_id, zone, "position" having count(*) > 1) x;
  if v_dup <> 0 then raise exception 'مواضع مكرّرة'; end if;

  select coalesce(string_agg(c.name,'، '),'—') into v_new_fail
    from public.run_critical_checks() c
   where not c.pass and c.name not in (select name from _pre_fail);
  if v_new_fail <> '—' then raise exception 'فحوصٌ رسبت بسبب هذا التغيير: %', v_new_fail; end if;

  raise notice 'راسبٌ سابقٌ لهذا التغيير (لم يُمسّ): %',
    (select coalesce(string_agg(name,'، '),'—') from _pre_fail);
end
$verify$;
