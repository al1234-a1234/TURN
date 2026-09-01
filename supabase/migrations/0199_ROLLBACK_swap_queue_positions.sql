-- ═══ تراجع ٠١٩٨ — إزالة تبديل موضعَي دورين ═══
--
-- يُطبَّق إن أظهرت الميزة عطلًا في الطابور الحيّ. وهو يزيل الدالّة والحارس
-- ويعيد قيد أنواع الأحداث كما كان.
--
-- ⚠ فقدُ بياناتٍ محدودٌ ومقصود: القيد الأصليّ لا يعرف النوع 'swapped'، فلا
-- يمكن إعادته وفي الجدول صفوفٌ بهذا النوع. فتُحذف أحداث التبديل وحدها —
-- وهي لا توجد أصلًا إلّا بسبب هذه الميزة، ولا يتعلّق بها صفُّ طابورٍ ولا
-- ضيف. يُطبع عددُها قبل الحذف كي لا يمرّ صامتًا.
--
-- ولا يمسّ هذا التراجع مواضعَ الطابور: ما بُدِّل يبقى مبدَّلًا. عكسُ تبديلٍ
-- جرى قبل ساعاتٍ يعني تحريك ضيوفٍ حقيقيّين بلا سببٍ يعرفونه — وذلك أسوأ
-- من ترك الحال على ما استقرّ عليه الاستقبال عمدًا.

do $rb0$
declare n int;
begin
  select count(*) into n from public.queue_events where kind = 'swapped';
  raise notice 'ستُحذف % حدثَ تبديل', n;
end $rb0$;

delete from public.queue_events where kind = 'swapped';

alter table public.queue_events drop constraint queue_events_kind_check;
alter table public.queue_events add constraint queue_events_kind_check
  check (kind = any (array['notified'::text, 'seated'::text, 'cancelled'::text,
                           'expired'::text, 'no_show'::text, 'restored'::text, 'moved'::text]));

drop function if exists public.swap_queue_positions(uuid, uuid);

-- q20: دالّةٌ زالت  143 → 142
do $rb1$
declare d text; d2 text;
begin
  select pg_get_functiondef(oid) into d from pg_proc
   where proname='run_critical_checks' and pronamespace='public'::regnamespace;
  d2 := replace(d, 'and p.prokind=''f'') = 143', 'and p.prokind=''f'') = 142');
  if d2 = d then raise exception 'مرساة عدّاد الدوالّ (143) لم تُطابق'; end if;
  execute d2;
end $rb1$;

-- إزالة الحارس w59 — بحذف النصّ نفسه الذي أدخله ٠١٩٨
do $rb2$
declare d text; d2 text; v_old text;
begin
  select pg_get_functiondef(oid) into d from pg_proc
   where proname='run_critical_checks' and pronamespace='public'::regnamespace;

  v_old :=
       E'    (''w59_swap_is_sealed_and_zone_safe'',\n'
    || E'       not has_function_privilege(''anon'', ''public.swap_queue_positions(uuid,uuid)'', ''EXECUTE'')\n'
    || E'       and (select position(''my_branch_ids_for'' in pg_get_functiondef(oid)) > 0\n'
    || E'               and position(''zone is distinct from'' in pg_get_functiondef(oid)) > 0\n'
    || E'              from pg_proc where proname=''swap_queue_positions''\n'
    || E'               and pronamespace=''public''::regnamespace)),\n';

  d2 := replace(d, v_old, '');
  if d2 = d then raise exception 'مرساة w59 لم تُطابق'; end if;
  execute d2;
end $rb2$;

-- تحقّقٌ بعديّ: لا انحدار مقارنةً بما كان راسبًا قبل التراجع
do $verify$
declare v_fn int; v_w59 int; v_swapped int;
begin
  select count(*) into v_fn from pg_proc
   where proname='swap_queue_positions' and pronamespace='public'::regnamespace;
  if v_fn <> 0 then raise exception 'الدالّة لم تُحذف'; end if;

  select count(*) into v_w59 from public.run_critical_checks()
   where name = 'w59_swap_is_sealed_and_zone_safe';
  if v_w59 <> 0 then raise exception 'w59 ما زال موجودًا'; end if;

  select count(*) into v_swapped from public.queue_events where kind='swapped';
  if v_swapped <> 0 then raise exception 'بقيت أحداث تبديل'; end if;

  -- لا مواضع مكرّرة في أيّ (فرع، قسم) حيّ
  if exists (
    select 1 from public.waitlist_entries
     where status in ('waiting','notified')
     group by branch_id, zone, "position" having count(*) > 1
  ) then raise exception 'مواضع مكرّرة بعد التراجع'; end if;
end
$verify$;
