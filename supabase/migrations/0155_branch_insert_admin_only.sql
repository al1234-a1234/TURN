-- ============================================================================
--  إنشاء الفرع صار صلاحية المنصّة وحدها — لا صلاحية المطعم.
--
--  ⛔ غير مطبَّق. ينتظر إذن المالك الصريح (تعديل RLS — خطٌّ أحمر).
--
--  ── الحادثة ──
--  حساب Pizza peel نفسه أنشأ ٩ فروعٍ إجمالًا لمطعمه: فرعٌ حقيقيّ واحد نشِط،
--  وثمانية فروعٍ مكرّرة معطّلة («Pizza peel» ستّ مرّات خلال ٥ ثوانٍ متتالية
--  في ٢٩ أغسطس ٠٣:٠٥، و«G»/«H» مرّتين في ٠٣:١٢) — نمط ضغطٍ متكرّر على زرّ
--  «+ إضافة فرع» بلا أن يوقفه شيء: لا حدّ معدّل، لا تعطيلٌ أثناء الإرسال،
--  لا تأكيد. صفر بياناتٍ حقيقيّة في الثمانية (وُثّق أدناه)، لكنّ الثغرة
--  الحقيقيّة ليست الفوضى — بل أنّ **فتح فرعٍ لم يكن يتطلّب إذن أحد**.
--
--  ── لماذا هذا قرار منصّةٍ لا قرار مطعم ──
--  فتح فرعٍ يمسّ الفوترة والتقارير على مستوى «إيت» كلّها — بخلاف تغيير
--  اسمٍ أو ساعةِ دوام. المالك قال صراحةً: «إنشاء الفروع صلاحيته وحده على
--  مستوى المنصّة، لا المطعم».
--
--  ── ما تغيّر بالضبط، ولماذا مسارين لا مسارًا واحدًا ──
--  السياسة القديمة `managers manage branches` كانت `FOR ALL` — أي INSERT
--  وUPDATE وDELETE معًا بنفس الشرط. لكنّ الإدارة اليوميّة تحتاج UPDATE فعلًا
--  (تعطيل فرعٍ مؤقّتًا من `dashboard/manage` — حذفٌ ناعمٌ لا صلب، `is_active
--  = false`، وظيفةٌ قائمة ومستعملة). فحذفُ السياسة كاملةً كان يكسر تلك
--  الوظيفة، والإبقاء عليها كاملةً يُبقي INSERT مفتوحًا. فصلها اثنتين:
--    `admin manages branches`   (ALL، قائمة، لم تُمسّ)   ← الأدمن وحده
--    `managers update branches` (UPDATE فقط، الشرط نفسه) ← الإدارة تبقى
--  ولا INSERT خارج سياسة الأدمن إطلاقًا.
--
--  ── الكود المقابل (على فرعٍ منفصل، مُدمَجٌ مستقلًّا عن هذا الترحيل) ──
--  `addBranch` حُذفت من `dashboard/manage/actions.ts`، وزرّها من الواجهة.
--  دالّةٌ جديدة `addBranchAdmin` في `admin/[id]/actions.ts` تتحقّق من
--  `is_platform_admin()` قبل RLS (دفاعٌ في العمق، لا اعتمادًا على الصفحة
--  وحدها) ولها نموذجٌ في `/admin/[id]`. **هذا الترحيل مستقلٌّ عن ذاك الفرع
--  عمدًا**: كود التطبيق آمنٌ الآن (لا واجهة ولا فعل خادمٍ يستدعي INSERT من
--  حساب مطعم)، وRLS طبقةُ أمانٍ ثانية — تأخّرها لا يفتح بابًا فعليًّا، لكنّه
--  يُبقي ثغرةً نظريّة (نداءٌ مباشر بمفتاح المطعم العام يتجاوز الواجهة).
--
--  ── ما اختُبر فعليًّا على الإنتاج (معاملة كاملة، أُلغيت عمدًا بلا COMMIT) ──
--  طُبِّق التغيير الكامل داخل معاملةٍ لم تُثبَّت، وحُووكيَ حساب Pizza peel
--  الحقيقيّ (`is_manager_of` عبر JWT مزيَّف لـowner_id الفعليّ):
--
--    محاولة INSERT فرعٍ جديد  ⇒ blocked: "new row violates row-level
--                                security policy for table branches"  ✅
--    محاولة UPDATE (is_active) على فرعه النشِط ⇒ SUCCEEDED (كما يجب) ✅
--
--  ثمّ تحقّقتُ بعد انتهاء الاتّصال أنّ لا شيء استُبقي: السياسة القديمة ما
--  زالت قائمة، لا صفّ باسم PROBE_SHOULD_FAIL، وis_active للفرع الحقيقيّ لم
--  يتغيّر. صفر أثر.
--
--  الحالة قبل التطبيق: سياسات public = 71 · دوالّ public = 140 (لا تغيير في
--  كليهما — سياسةٌ تُحذف وأخرى تُضاف، فلا حاجة لبصمةٍ جديدة).
-- ============================================================================

drop policy "managers manage branches" on public.branches;

create policy "managers update branches" on public.branches for update
  using (is_manager_of(restaurant_id) and can_access_branch(id))
  with check (
    is_manager_of(restaurant_id)
    and (
      is_platform_admin()
      or exists (
        select 1 from public.staff s
         where s.user_id = (select auth.uid())
           and s.is_active
           and s.restaurant_id = branches.restaurant_id
           and (s.branch_id is null or s.branch_id = branches.id)
      )
    )
  );

comment on policy "managers update branches" on public.branches is
  'مدير المطعم يعدّل فروعه القائمة (مثلًا: تعطيل مؤقّت) — لا ينشئ جديدًا. الإنشاء حصرًا لـ admin manages branches (0155).';

-- حارس: لا سياسة INSERT أو ALL على branches غير سياسة الأدمن — أيّ عودةٍ
-- مستقبليّة لصلاحية إنشاءٍ خارج /admin (حتى بصيغةٍ مختلفة، اسمٍ آخر) تُسقط
-- هذا الفحص فورًا بدل أن تتكرّر الحادثة صامتة.
do $mig$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='run_critical_checks';
  if v_def is null then raise exception 'run_critical_checks غير موجودة'; end if;

  if position('w32_branch_insert_admin_only' in v_def) = 0 then
    v_def := replace(v_def, E'    (\'q20_schema_no_drift\',',
      E'    (\'w32_branch_insert_admin_only\', not exists (\n'
   || E'        select 1 from pg_policies\n'
   || E'         where schemaname=\'public\' and tablename=\'branches\'\n'
   || E'           and cmd in (\'INSERT\',\'ALL\') and policyname <> \'admin manages branches\')),\n'
   || E'    (\'q20_schema_no_drift\',');
  end if;

  execute v_def;
end
$mig$;

-- المتوقَّع بعد التطبيق: سياسات public لا تزال ٧١ · الدوالّ لا تزال ١٤٠ ·
-- الفحوص ٢٠٣/٢٠٣ (أو أكثر إن سبقه ترحيلٌ آخر من الليلة) · w32 أخضر.
