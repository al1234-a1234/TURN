-- ============================================================================
--  تراجع ٠٢٠٤ — إزالة مصرف الأعطال الحقيقيّة.
--
--  مكتوبٌ قبل الترحيل ومُختبَرٌ لا مفترَض.
--
--  ── ما يعود بعده ──
--  لا يبقى أثرٌ للمصرف: يسقط الجدول ودالّته، وتعود أرقام q20 إلى ما كانت.
--  وأثرُه التشغيليّ أنّ فشل الانضمام الحقيقيّ وأخطاء ٥٠٠ تعود بلا تسجيل —
--  أي الحال قبل ٠٢٠٤ لا انحدارٌ جديد.
--
--  ── وما يجب أن يسبقه ──
--  إن كان كتّاب المصرف قد شُحنوا (instrumentation.ts وactions.ts)، فالتراجع
--  عن القاعدة وحدها يترك نداءً لدالّةٍ غير موجودة. والنداء ملفوفٌ بـtry/catch
--  في الطرفين فلا يُسقط طلبَ ضيف — لكنّ الترتيب الصحيح: تراجعُ الشيفرة أوّلًا.
-- ============================================================================

drop function if exists public.log_failure_event(text, text, text, uuid, jsonb);
drop table if exists public.failure_events;

-- إعادة أرقام q20 إلى خطّ الأساس السابق: ٣٥ جدولًا · ١٤٣ دالّة · ٤٣ مفتاحًا.
-- بإحلالٍ نصّيٍّ مرتكز، وبفشلٍ صريحٍ إن لم يُطابَق المرتكز — لأنّ إحلالًا
-- صامتًا لا يقع هو نفسه عطب ٠١٦٩ الذي صحّحه ٠١٧١.
do $mig$
declare v_def text; v_before text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='run_critical_checks';
  if v_def is null then raise exception 'run_critical_checks غير موجودة'; end if;

  v_before := v_def;
  v_def := replace(v_def, E'and c.relkind=\'r\') = 36',  E'and c.relkind=\'r\') = 35');
  v_def := replace(v_def, E'and p.prokind=\'f\') = 144', E'and p.prokind=\'f\') = 143');
  v_def := replace(v_def, E'and c.contype=\'f\') = 44)', E'and c.contype=\'f\') = 43)');

  if v_def = v_before then
    raise exception 'لم يُطابَق أيّ مرتكز في q20 — أرقام الأساس ليست ٣٦/١٤٤/٤٤';
  end if;

  execute v_def;
end
$mig$;
