-- ════════════════════════════════════════════════════════════════════════════
--  استبدال القفل الاستشاري بقفل صفّي على الفرع (FOR UPDATE)
--
--  محاكاة حملٍ حقيقيّة (١٠ مطاعم، عبر k6 ثم PostgREST — نفس مسار الإنتاج
--  تمامًا) شغّلت join_waitlist_guest تزامنيًّا وكشفت أن pg_advisory_xact_lock
--  لم يمنع تكرار position فعليًّا: ٥ حالات تكرار، أبرزها ترتيب ١ مُسنَدٌ إلى
--  ١١ عميلًا حيًّا في فرعٍ واحد (04_verify.sql، simulation/README.md).
--
--  تتبّع مسار الكتابة الكامل (Server Action ← join_waitlist_guest ← تريغر
--  set_waitlist_position) يؤكّد أن الحساب والإدراج يقعان داخل معاملةٍ واحدة
--  من نداءٍ واحد — لا استدعاءين منفصلين من التطبيق. السبب الدقيق لفشل القفل
--  الاستشاري تحت هذا التزامن لم يُثبَت (يحتاج اختبار اتصالٍ مباشرٍ لا أملك
--  صلاحيّته)، لكن قفل الصفّ القياسيّ (SELECT ... FOR UPDATE) لا يعتمد على
--  دلالات القفل الاستشاري ولا على سلوك أي مُجمِّع اتصالات (Supavisor أو
--  غيره) — فهو الأصلح بصرف النظر عن التشخيص الدقيق.
--
--  المفتاح يبقى new.branch_id وحده (صفّ الفرع نفسه)، فلا تتسلسل الفروع خلف
--  قفلٍ واحد كما كان الحال في القفل الاستشاري.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.set_waitlist_position()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.position is null then
    -- قفل صفّ الفرع نفسه، يُحرَّر تلقائيًّا في نهاية المعاملة.
    perform 1 from public.branches where id = new.branch_id for update;

    -- الطابور الحيّ كلّه، بلا حصرٍ بيومٍ تقويميّ (0108) — فمن انتظر قبل
    -- منتصف الليل يبقى أمام من جاء بعده.
    select coalesce(max(w.position), 0) + 1
      into new.position
      from public.waitlist_entries w
     where w.branch_id = new.branch_id
       and w.status in ('waiting', 'notified');
  end if;
  return new;
end;
$function$;
