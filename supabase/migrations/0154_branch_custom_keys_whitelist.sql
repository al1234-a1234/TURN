-- ============================================================================
--  قائمة مفاتيح مسموحة صارمة على branch_settings.custom
--
--  ⛔ غير مطبَّق. ينتظر إذن المالك الصريح (ترحيل + قيد).
--
--  ── لماذا قبل أوّل ميزةٍ من التسع ──
--  `custom` عمودٌ حرّ. وميزةٌ اختياريّة تُقرأ بـ`custom->>'cap_counter'`
--  ستُكتب يومًا `capCounter` أو `cap_conter`، فيُحفظ المفتاح بنجاح ولا يقرؤه
--  أحد: المالك يضغط «فعّل» ويرى «حُفظ»، والميزة لا تعمل أبدًا ولا خطأ في
--  أيّ سجلّ. **هذا هو نمط الفشل الصامت نفسه الذي نطارده منذ ثلاثة أيّام** —
--  إلّا أنّه هنا يتكرّر مع كلّ ميزةٍ جديدة بدل أن يقع مرّة.
--
--  ── والآن هي اللحظة الوحيدة التي يكون فيها القيد بلا مخاطرة ──
--  فُحص العمود على الإنتاج قبل كتابة هذا: **صفر مفاتيح في اثني عشر صفًّا**.
--  فالقيد لا يُخالفه صفٌّ قائم، ولا يحتاج ترحيل بيانات. وكلّ يومٍ يمرّ بعد
--  أوّل ميزةٍ يجعل إضافته أصعب.
--
--  ── ويحرس النوع لا الاسم فقط ──
--  مفتاحٌ صحيحُ الاسم بقيمةٍ نصّيّة `"true"` بدل منطقيّة `true` يفشل بنفس
--  الصمت. فكلّ راية منطقيّةٌ إلزامًا، والنافذة عددٌ صحيحٌ في مدًى معقول.
--
--  ── المفاتيح، وكلّها اختياريّةٌ لكلّ مطعمٍ على حدة ──
--    cap_counter     راية — عدّاد السقف الظاهر «١٢ / ٢٠»
--    day_log         راية — سجلّ اليوم
--    undo_minutes    عدد  — نافذة التراجع بالدقائق (١..٦٠)
--    reorder_queue   راية — تحريك ترتيب العملاء
--    call_timer      راية — مؤقّت استدعاء العميل
--    full_button     راية — زرّ «ممتلئ» منفصل
--    staff_tour      راية — الجولة التعريفيّة للموظّف
--
--  إضافةُ مفتاحٍ لاحقًا تعديلٌ **مقصود** في هذا الملفّ لا انزلاقٌ صامت — وهو
--  الغرض كلّه. ومن ينسى توسيع القائمة يرتدّ عليه القيد فورًا بخطأٍ صريح،
--  لا بميزةٍ ميّتة يكتشفها المالك بعد أسبوع.
--
--  ── وماذا لو أُلغي ──
--    alter table public.branch_settings drop constraint branch_settings_custom_keys;
--  ولا يفقد شيئًا: القيد يمنع الكتابة الخاطئة ولا يُخزّن شيئًا.
-- ============================================================================

create or replace function public.branch_custom_ok(p_custom jsonb)
returns boolean
language sql
immutable
set search_path to ''
as $function$
  select
    p_custom is null
    or (
      jsonb_typeof(p_custom) = 'object'
      -- لا مفتاحَ خارج القائمة
      and not exists (
        select 1 from jsonb_object_keys(p_custom) k
         where k not in ('cap_counter','day_log','undo_minutes',
                         'reorder_queue','call_timer','full_button','staff_tour')
      )
      -- والرايات منطقيّةٌ لا نصّيّة
      and not exists (
        select 1 from jsonb_each(p_custom) e
         where e.key in ('cap_counter','day_log','reorder_queue',
                         'call_timer','full_button','staff_tour')
           and jsonb_typeof(e.value) <> 'boolean'
      )
      -- والنافذة عددٌ صحيحٌ في مدًى معقول
      and (
        not (p_custom ? 'undo_minutes')
        or (jsonb_typeof(p_custom->'undo_minutes') = 'number'
            and (p_custom->>'undo_minutes') ~ '^[0-9]+$'
            and (p_custom->>'undo_minutes')::int between 1 and 60)
      )
    )
$function$;

comment on function public.branch_custom_ok(jsonb) is
  'حارس مفاتيح branch_settings.custom: قائمة مسموحة صارمة + تحقّق من النوع. مفتاحٌ مكتوبٌ خطأً يُرفض بخطأ صريح بدل أن يُحفظ ولا يقرأه أحد.';

alter table public.branch_settings
  add constraint branch_settings_custom_keys
  check (public.branch_custom_ok(custom));

-- حارسان في الفحص اليوميّ: القيد نفسه، والدالّة التي يستند إليها.
do $mig$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='run_critical_checks';
  if v_def is null then raise exception 'run_critical_checks غير موجودة'; end if;

  if position('w31_custom_keys_guarded' in v_def) = 0 then
    v_def := replace(v_def, E'    (\'q20_schema_no_drift\',',
      E'    (\'w31_custom_keys_guarded\', exists(select 1 from pg_constraint\n'
   || E'                                   where conname=\'branch_settings_custom_keys\')),\n'
   || E'    (\'w31_custom_rejects_typo\', not public.branch_custom_ok(\'{"cap_conter": true}\'::jsonb)\n'
   || E'                                 and not public.branch_custom_ok(\'{"cap_counter": "true"}\'::jsonb)\n'
   || E'                                 and public.branch_custom_ok(\'{"cap_counter": true}\'::jsonb)),\n'
   || E'    (\'q20_schema_no_drift\',');
  end if;

  -- دالّةٌ جديدة ⇒ خطّ الأساس يتحرّك في نفس الترحيل، لا في ترحيلٍ تالٍ.
  v_def := replace(v_def, E'p.prokind=\'f\') = 140', E'p.prokind=\'f\') = 141');

  execute v_def;
end
$mig$;

-- المتوقَّع بعد التطبيق: الدوالّ ١٤١ · الفحوص ٢٠٤/٢٠٤ · q20 أخضر.
