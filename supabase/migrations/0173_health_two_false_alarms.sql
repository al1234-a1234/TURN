-- 0173 — الإنذاران الكاذبان في check_platform_health
--
-- إنذارٌ كاذبٌ يتكرّر أخطرُ من غياب إنذار: يُدرَّب المشغّل على تجاهل اللون
-- الأحمر، فيتجاهله يوم يصدق. وهذان نطقا فعلًا هذا الأسبوع (alert_state):
--   no_stuck_queries  — أطلق وتعافى ٠١ سبتمبر ٠٢:٣٥
--   join_flatline     — أطلق وتعافى ٣١ أغسطس ٢٣:٣٠
--
-- التعديل موضعيّ: مسندان اثنان داخل الدالّة، والباقي بحرفه.
-- ولذلك يُنفَّذ باستبدالٍ نصّيٍّ مرتكزٍ على نصٍّ بعينه لا بإعادة كتابة
-- الدالّة كاملة: إعادة الكتابة تُعيد أيضًا أيّ انحرافٍ حيٍّ لا نعلمه،
-- والاستبدال المرتكز يفشل صائحًا إن لم يجد مرتكزه — وهو ما نريد.
--
-- العشرة الباقية من الفحوص الاثني عشر لم تُلمس.

begin;

do $r$
declare
  d text; d1 text; d2 text;
begin
  select pg_get_functiondef(oid) into d
    from pg_proc
   where proname = 'check_platform_health'
     and pronamespace = 'public'::regnamespace;

  if d is null then
    raise exception 'check_platform_health غير موجودة — توقّف';
  end if;

  -- ═══════════════════════════════════════════════════════════════
  -- (١) no_stuck_queries — اتصالات النسخ دائمةٌ بالتصميم
  -- ═══════════════════════════════════════════════════════════════
  -- Realtime يفتح START_REPLICATION ويتركه مفتوحًا ما دامت شاشة استقبالٍ
  -- واحدة مفتوحة — فهو «نشِطٌ منذ ساعات» دائمًا وأبدًا. عدّه استعلامًا
  -- عالقًا يجعل الفحص يحمرّ كلّما اشتغل النظام كما يجب، وهو أسوأ ما
  -- يُقال عن فحص.
  --
  -- ولا يُخفي عطلًا حقيقيًّا: الاستثناء مقصورٌ على ما يبدأ بهذه الكلمة
  -- وحدها، وأيّ استعلامٍ آخر عالقٍ أكثر من ٣٠ ثانية يبقى معدودًا.

  d1 := replace(d,
    E'  where state = ''active'' and now() - query_start > interval ''30 seconds''\n    and query not ilike ''%pg_stat_activity%'';',
    E'  where state = ''active'' and now() - query_start > interval ''30 seconds''\n    and query not ilike ''%pg_stat_activity%''\n    and query not ilike ''START_REPLICATION%'';'
  );
  if d1 = d then
    raise exception 'لم أجد مرتكز no_stuck_queries — توقّف قبل تعديلٍ أعمى';
  end if;

  -- ═══════════════════════════════════════════════════════════════
  -- (٢) join_flatline — الفرع الموقوف عمدًا ليس فرعًا انكسر رابطه
  -- ═══════════════════════════════════════════════════════════════
  -- كان يسأل عن الساعات وحدها: «مفتوحٌ بالساعات + دخله ٣ فأكثر ثمّ صفر
  -- في آخر ٣٠ دقيقة ⇒ أنذِر». فمن يضغط «أوقف الانضمام» أو «أوقف الطابور»
  -- أو يقفل يدويًّا وهو داخل ساعات دوامه — وهو بالضبط ما يفعله الاستقبال
  -- آخر الليل — يُنتج توقّفًا مقصودًا يقرؤه الفحص عطلًا.
  --
  -- الشرط منسوخٌ من alert_peak_join_stall (٠١٧٢) لا مخترعًا: نفس الأعلام
  -- الثلاثة وبنفس صيغة coalesce، كي لا يفترق الحارسان في تعريف «مفتوح».

  d2 := replace(d1,
    E'  where rc.prev60 >= 3 and rc.last30 = 0\n    and public.branch_open_by_hours(bs.opening_hours, now());',
    E'  where rc.prev60 >= 3 and rc.last30 = 0\n    and not coalesce(bs.manually_closed, false)\n    and not coalesce(bs.queue_paused,   false)\n    and not coalesce(bs.join_frozen,    false)\n    and public.branch_open_by_hours(bs.opening_hours, now());'
  );
  if d2 = d1 then
    raise exception 'لم أجد مرتكز join_flatline — توقّف قبل تعديلٍ نصفيّ';
  end if;

  execute d2;
end $r$;

-- تحقّقٌ بعديّ: المسندان حاضران مرّةً واحدة لا أكثر، والدالّة ما زالت
-- SECURITY DEFINER بمسار بحثٍ مثبَّت (وإلّا فقد التعديل خاصّيةً أمنيّة).
do $v$
declare d text; n1 int; n2 int; secdef boolean; hascfg boolean;
begin
  select pg_get_functiondef(p.oid), p.prosecdef,
         exists (select 1 from unnest(coalesce(p.proconfig,'{}'::text[])) c where c like 'search_path=%')
    into d, secdef, hascfg
    from pg_proc p
   where p.proname='check_platform_health' and p.pronamespace='public'::regnamespace;

  select count(*) into n1 from regexp_matches(d, 'START_REPLICATION', 'g');
  select count(*) into n2 from regexp_matches(d, 'manually_closed', 'g');

  if n1 <> 1 then raise exception 'START_REPLICATION ظهر % مرّة لا مرّةً واحدة', n1; end if;
  if n2 <> 1 then raise exception 'manually_closed ظهر % مرّة لا مرّةً واحدة', n2; end if;
  if not secdef then raise exception 'فقدت الدالّة SECURITY DEFINER'; end if;
  if not hascfg then raise exception 'فقدت الدالّة search_path المثبَّت'; end if;
end $v$;

commit;

-- ═══════════════════════════════════════════════════════════════════
-- لا أثر على q20 ولا على أي عدّاد
-- ═══════════════════════════════════════════════════════════════════
-- لا دالّة جديدة ولا جدول ولا سياسة ولا مفتاح — تعديل جسمٍ قائم فقط.
-- فـ run_critical_checks تبقى ٢١٣/٢١٣ بلا لمسٍ لأي مرجع.
--
-- الرجوع (إن لزم): اعكس الاستبدالين — احذف السطر
--   and query not ilike 'START_REPLICATION%'
-- والأسطر الثلاثة coalesce، ثمّ execute التعريف. ويعود الإنذاران
-- الكاذبان معهما.
