-- ============================================================================
--  قلب الافتراض: الطابور مغلقٌ حتى يفتحه الاستقبال.
--
--  ✅ مطبَّق على الإنتاج ٣٠ أغسطس بقرار المالك.
--
--  ── حجّة المالك، وقد غلبت حجّتي ──
--  اعترضتُ بأنّ العميل البعيد الذي يأخذ دوره وهو في الطريق هو بالضبط الحالة
--  التي بُني لها الدور، وأنّ القلب يجعله أثرًا للازدحام لا استباقًا له.
--
--  وردّ المالك أقوى: **الخوف ليس أن يفوتنا عميلٌ بعيد، بل أن يأخذ أحدهم
--  دورًا في مطعمٍ فارغ تمامًا فيرى غيرُه «فيه انتظار» فيظنّها زحمة فلا
--  يجيء — والمطعم خالٍ.** الطابور حينها سببُ نفورٍ لا خدمة. وضررُ ذلك يقع
--  على المطعم نفسه ويتكرّر كلّ ليلةٍ هادئة، بينما العميل البعيد حالةٌ
--  أندر وأخفّ. فأُخذ برأيه.
--
--  «ولا أقبل أن يكون اختراع انتظارٍ من العدم ممكنًا أصلًا.»
--
--  ── ما تغيّر: سطرٌ واحد ──
--  `set default true`. لا عمود جديد، ولا دالّة تغيّرت، ولا صفٌّ قائم مُسّ.
--
--  ── ولماذا لم يتأثّر مطعمٌ قائم ──
--  `ALTER COLUMN ... SET DEFAULT` يُقرأ عند `INSERT` بلا عمود — لا عند
--  التغيير. لا `UPDATE` ضمنيّ ولا إعادة كتابة جدول. فإفيكتو وبيتزا بيل
--  بقيا `false` حرفيًّا وطابورهما يعمل، **ولم يُكتب لهما `UPDATE` عمدًا**:
--  ذلك يقفل طابورَي مطعمين عاملَين فجأةً.
--
--  ── الكرون معكوسًا — وهنا كان التباس أمرِ المالك ──
--  طُلب «أخرِج queue_paused من الكرون حتى لا يفتح الطابور كلّ فجر، بل يبقى
--  الإطفاء الفجريّ عاملًا لمن نسيه مفتوحًا». والشقّان يتعارضان: الإخراج
--  يعني ألّا يُطفأ أحدٌ أبدًا — عكس النيّة، وعكس حجّة المالك نفسه أنّ
--  «النسيان المحتمَل هو أن يفتحه ثم ينسى إطفاءه».
--
--  فالكلمة بُنيت على الدلالة القديمة: بعد القلب، «الإطفاء الفجريّ» ليس
--  حذفَ السطر بل **قلبَ قيمته**. عُرض الالتباس على المالك بثلاثة خيارات
--  صريحة قبل التطبيق، فاختار الإطفاء.
--
--    manually_closed = false  ← فتحٌ (دلالتها لم تُقلب)
--    busy_now        = false  ← مسحٌ
--    queue_paused    = true   ← **إطفاء**
--
--  والشرط عُكس (`not queue_paused`) ليلتقط الصفوف المفتوحة لا الموقوفة.
--
--  ── الأثر اليوميّ ──
--  المضيف يفتح الطابور كلّ مساءٍ عند بداية الازدحام، ويُطفأ تلقائيًّا
--  الرابعة فجرًا بتوقيت الرياض. يفتحه كلّ يوم — وهو ما وصفه المالك:
--  «أداته التي ترتّبه» لا مهمّةً إضافيّة يتذكّرها.
--
--  ── ما اختُبر فعليًّا (فرع اختبارٍ أُنشئ على المراقبة ثم حُذف) ──
--    ١) فرع جديد            ⇒ queue_paused = true  ✅ ورث الافتراض
--    ٢) مفتوح ثم الفجر      ⇒ أُطفئ ✅
--    ٣) موقوف ثم الفجر      ⇒ بقي موقوفًا ✅ (لا يفتح أحدًا)
--  ونصّ الكرون شُغِّل **مقصورًا على فرع الاختبار وحده**: تشغيله على مداه
--  يقفل طابور مطعمين عاملَين، فلا يُجرَّب كما هو.
--
--  الحالة بعده: الافتراض true · إفيكتو false · بيتزا بيل false · ٢٠١/٢٠١.
-- ============================================================================

alter table public.branch_settings
  alter column queue_paused set default true;

comment on column public.branch_settings.queue_paused is
  'الطابور موقوف. الافتراض true منذ 0150: المطعم الجديد يولد بلا طابور، والاستقبال يفتحه عند بداية الازدحام. لا يشطب الطابور القائم ولا يخفي الفرع.';

select cron.unschedule('reset-manual-flags')
 where exists (select 1 from cron.job where jobname='reset-manual-flags');

select cron.schedule('reset-manual-flags', '0 1 * * *', $cron$
  update public.branch_settings
     set manually_closed = false, busy_now = false, queue_paused = true
   where manually_closed or busy_now or not queue_paused
$cron$);

-- حارسان: الاتجاه نفسه يستحقّ فحصًا، فسطرٌ واحدٌ خاطئ هنا يقلب المعنى
-- (يفتح بدل أن يطفئ) بلا أن يلاحظه أحد إلا بعد ليلةٍ كاملة.
do $mig$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='run_critical_checks';
  if v_def is null then raise exception 'run_critical_checks غير موجودة'; end if;

  if position('w27_pause_default_closed' in v_def) = 0 then
    v_def := replace(v_def, E'    (\'q20_schema_no_drift\',',
      E'    (\'w27_pause_default_closed\', (select column_default = \'true\' from information_schema.columns\n'
   || E'                                   where table_schema=\'public\' and table_name=\'branch_settings\'\n'
   || E'                                     and column_name=\'queue_paused\')),\n'
   || E'    (\'w27_dawn_closes_not_opens\', (select command like \'%queue_paused = true%\'\n'
   || E'                                    from cron.job where jobname=\'reset-manual-flags\')),\n'
   || E'    (\'q20_schema_no_drift\',');
  end if;

  execute v_def;
end
$mig$;

-- ملاحظة: لا تغيير في عدد الدوال ⇒ q20_schema_no_drift لا يتحرّك.
