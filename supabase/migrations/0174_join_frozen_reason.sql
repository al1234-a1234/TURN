-- 0174 — سببُ إيقاف الانضمام: «اكتملت اليوم» أم «مزدحمٌ مؤقّتًا»
--
-- الحالة الثالثة (join_frozen، ٠١٦٧) تمنع الانضمام الجديد، وكانت تعرض
-- للعميل رسالةً واحدة مهما كان السبب: «الطابور ممتلئ حاليًا».
--
-- والسببان مختلفان في أثرهما على الضيف اختلافًا تامًّا:
--   • اكتمل اليوم    ⇒ لا تنتظر، تعال غدًا.        (قرارٌ نهائيّ لليلة)
--   • مزدحمٌ مؤقّتًا  ⇒ انتظر لحظات ثمّ أعد المحاولة. (حالةٌ تتغيّر بدقائق)
-- ورسالةٌ واحدة لهما تجعل نصف الضيوف ينتظرون بلا فائدة، والنصف الآخر
-- ينصرف وقد كان مكانه سيُفتح بعد دقيقتين.
--
-- ⚠️ السقف العدديّ التلقائيّ (max_waitlist_size) خارج هذا كلّه:
--    لا يضبط join_frozen ولا join_frozen_reason، ويُفتح تلقائيًّا مع نزول
--    العدد كما كان بالضبط. لم يُلمس سلوكه بحرف.

begin;

-- ═══════════════════════════════════════════════════════════════════
-- العمود
-- ═══════════════════════════════════════════════════════════════════
alter table public.branch_settings
  add column if not exists join_frozen_reason text;

comment on column public.branch_settings.join_frozen_reason is
  'سبب إيقاف الانضمام اليدويّ: done_today (اكتمل اليوم) أو temporary '
  '(ازدحامٌ عابر) أو NULL. لا علاقة له بالسقف العدديّ max_waitlist_size.';

-- قيدٌ لا تعليقٌ فقط: القيمة تصل من الواجهة، والواجهةُ تُخترق.
alter table public.branch_settings
  drop constraint if exists branch_settings_join_frozen_reason_chk;
alter table public.branch_settings
  add constraint branch_settings_join_frozen_reason_chk
  check (join_frozen_reason is null
         or join_frozen_reason in ('done_today', 'temporary'));

-- ═══════════════════════════════════════════════════════════════════
-- الدالّة — معاملٌ ثالثٌ بقيمةٍ افتراضية
-- ═══════════════════════════════════════════════════════════════════
-- تُسقَط النسخة ذات المعاملين ثمّ تُنشأ ذات الثلاثة: لو أبقيناهما معًا
-- لَاستقرّ نداءٌ بمعاملين على القديمة (تطابقٌ حرفيّ) فلا يُكتب السبب أبدًا
-- ويبقى العطل حيًّا وهو «مُصلَح» على الورق. والصافي صفرٌ في عدد الدوالّ،
-- فعدّاد q20 لا يتحرّك.
--
-- والصلاحية كما هي حرفيًّا: waitlist عبر is_staff_of + can_access_branch.
-- لم يُوسَّع شيء.

drop function if exists public.set_branch_join_frozen(uuid, boolean);

create function public.set_branch_join_frozen(
  p_branch_id uuid,
  p_frozen    boolean,
  p_reason    text default null
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_frozen boolean := coalesce(p_frozen, false);
  v_reason text;
begin
  if not (
    public.is_platform_admin()
    or (public.is_staff_of(public.restaurant_of_branch(p_branch_id))
        and public.can_access_branch(p_branch_id))
  ) then
    return false;
  end if;

  -- سببٌ غير معروف ⇒ NULL لا خطأ. هذا الزرّ يُضغط على الباب ووراءه صفّ،
  -- فخطأٌ يمنع الإيقاف أسوأ من رسالةٍ أعمّ: القيمة المجهولة تسقط إلى
  -- «مزدحمٌ مؤقّتًا» عند العميل، وهي الرسالة الآمنة في الحالتين.
  -- وفكُّ الإيقاف يمسح السبب دائمًا: سببٌ باقٍ بلا إيقافٍ كذبةٌ مؤجّلة.
  v_reason := case
                when not v_frozen then null
                when p_reason in ('done_today', 'temporary') then p_reason
                else null
              end;

  update public.branch_settings
     set join_frozen        = v_frozen,
         join_frozen_reason = v_reason,
         updated_at         = now()
   where branch_id = p_branch_id;

  return found;
end;
$function$;

commit;

-- ═══════════════════════════════════════════════════════════════════
-- أثرٌ على الفحوص: لا شيء
-- ═══════════════════════════════════════════════════════════════════
-- q20 يعدّ الجداول والدوالّ والسياسات والمفاتيح الخارجية — والعمود الجديد
-- ليس واحدًا منها، والقيد contype='c' لا 'f'، والدالّة أُسقطت وأُنشئت
-- فالصافي صفر. تبقى ٢١٣/٢١٣ كما هي.
--
-- الرجوع:
--   drop function if exists public.set_branch_join_frozen(uuid, boolean, text);
--   create function public.set_branch_join_frozen(p_branch_id uuid, p_frozen boolean)
--     ... (النسخة السابقة: تضبط join_frozen وحده)
--   alter table public.branch_settings
--     drop constraint if exists branch_settings_join_frozen_reason_chk;
--   alter table public.branch_settings drop column if exists join_frozen_reason;
-- وأرجِع الكود قبل إسقاط العمود، وإلّا فسّرت الواجهة عمودًا غائبًا.
