-- ============================================================================
--  نشر waitlist_entries على قناة Realtime — لشاشة الاستقبال وحدها.
--
--  ⛔ غير مطبَّق. ينتظر إذن المالك الصريح.
--
--  ── ولماذا لم أطبّقه رغم أنّ البند مأمورٌ به ──
--  خطُّ المالك الأحمر يستثني «ترحيل مخطّط» من صلاحيتي المستقلّة، و
--  `ALTER PUBLICATION` تغييرٌ على مستوى القاعدة لا على صفّ. والأهمّ: تطبيقه
--  الليلة **لا يشتري شيئًا** — الشيفرة مصمَّمة ألّا تتعلّق بتوقيت التطبيق
--  إطلاقًا (انظر أدناه)، والمالك سيراجع ويدمج صباحًا على أيّ حال. فالمكسب
--  صفر والمخاطرة ليست صفرًا.
--
--  ── ولماذا لا يكسر شيئًا إن تأخّر تطبيقه، ولا إن تأخّر الدمج ──
--  `AutoRefresh` يبدأ دائمًا بفترة الاستطلاع السريعة (٤ث) — نفس سلوك اليوم —
--  ولا يسترخي إلى ٣٠ث إلّا بعد أن يردّ الخادمُ `SUBSCRIBED`. فإن لم يكن
--  الجدول منشورًا، أو حُجب WebSocket في شبكة المطعم، بقي الاستقبال على ٤ث
--  كما هو اليوم. **لا حالة يصير فيها أبطأ ممّا كان.**
--
--  ── ماذا يرى المشترِك: RLS تحكم، لا هذا السطر ──
--  Realtime في Supabase يطبّق سياسات الجدول على كلّ مشترِك بجلسته. وسياسة
--  `staff reads branch waitlist` قائمة:
--      branch_id = any(coalesce(my_branch_ids_for('waitlist'), '{}'))
--  فالموظّف يرى فروعه وحدها، ولا يتسرّب صفُّ مطعمٍ إلى مطعمٍ آخر. وهذا
--  السطر **لا يمنح أحدًا شيئًا لم يكن يقرؤه أصلًا** بالاستعلام العاديّ؛
--  يغيّر متى يصله لا ما يصله.
--
--  ── ولماذا لم تُلمس REPLICA IDENTITY ──
--  الافتراضيّة (`d` = مفتاحٌ رئيسيّ) تكفي: كلّ ما يهمّ الاستقبالَ هو INSERT
--  (انضمام) وUPDATE (تقديم/إجلاس/إلغاء — كلّها تغييرُ `status` لا حذفُ صفّ).
--  وتحويلها إلى FULL يضاعف حجم WAL لكلّ تعديل في أكثر جداولنا كتابةً، ثمنًا
--  لحدثٍ لا نستعمله. وإن سقط حدثٌ لأيّ سببٍ فالاستطلاع يلتقطه خلال ٣٠ث.
--
--  ── وماذا لو أُلغي لاحقًا ──
--  عكسُه سطرٌ واحد ولا يفقد شيئًا:
--      alter publication supabase_realtime drop table public.waitlist_entries;
--  ويعود الاستقبال تلقائيًّا إلى ٤ث عند أوّل سقوطٍ للقناة.
--
--  الحالة قبل التطبيق: النشرة موجودة · صفر جداول منشورة · wal_level = logical.
-- ============================================================================

do $mig$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'waitlist_entries'
  ) then
    alter publication supabase_realtime add table public.waitlist_entries;
  end if;
end
$mig$;

-- حارس: نشرةٌ تسقط بصمتٍ تعني استقبالًا يظنّ نفسه حيًّا. والفحص يجعل
-- سقوطها مرئيًّا في الفحص اليوميّ لا في شكوى مضيف.
do $mig$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='run_critical_checks';
  if v_def is null then raise exception 'run_critical_checks غير موجودة'; end if;

  if position('w29_waitlist_published_realtime' in v_def) = 0 then
    v_def := replace(v_def, E'    (\'q20_schema_no_drift\',',
      E'    (\'w29_waitlist_published_realtime\', exists (select 1 from pg_publication_tables\n'
   || E'          where pubname=\'supabase_realtime\' and schemaname=\'public\'\n'
   || E'            and tablename=\'waitlist_entries\')),\n'
   || E'    (\'q20_schema_no_drift\',');
  end if;

  execute v_def;
end
$mig$;

-- ملاحظة: لا دالّة أُنشئت ولا صلاحية مُسّت ⇒ q20_schema_no_drift لا يتحرّك.
-- المتوقَّع بعد التطبيق: ٢٠٣/٢٠٣.
