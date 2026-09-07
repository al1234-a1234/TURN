-- ثلاثة طلبات مشغّل مدمجة بهذا الترحيل، كلّها على نفس السجل (queue_events
-- / branch_day_log / swap_queue_positions):
--
-- ١) التبديل يسجّل اليوم حدثًا واحدًا (لطرف A فقط)، والاسم الآخر مدفونٌ في
--    detail بلا عرض. الآن يُسجَّل حدثان — واحدٌ لكل طرف — وكلٌّ يحمل اسم
--    مقابله (detail->>'with_name'), فيظهر «تبادل مع فلان» على كلا البطاقتين
--    لا بطاقة واحدة.
--
-- ٢) نافذة السجل ثابتة (آخر ٨ ساعات) بلا رجوعٍ لتاريخ. أُضيف p_from/p_to
--    اختياريَّين — إن غابا (الاستدعاء الحالي من الشاشة الحيّة) يبقى السلوك
--    كما هو تمامًا؛ إن حُدِّدا تُستعلَم تلك الفترة بدل النافذة المتحرّكة.
--    وسقف الصفوف يرتفع للاستعلام التاريخي (٢٠٠ → ١٠٠٠) — يوم مزدحمًا كاملًا
--    قد يتجاوز ٢٠٠ حدثًا بسهولة.
--
-- ٣) تعطيل تنظيف الـ٣٠-يوم: طلب المالك صراحةً سجلًّا محفوظًا يُرجَع إليه —
--    ٦٥٦ صفًّا خلال أسبوع (~٣٤ ألفًا بالسنة) لا يبرّر حذفًا؛ الفهرس
--    (branch_id, at DESC) موجودٌ أصلًا فيبقى الاستعلام سريعًا مهما طال
--    المدى. الدالّة public.prune_queue_events() نفسها تبقى معرَّفةً (لا حذف)
--    — إن أُريد تفعيل تنظيفٍ لاحقًا بأي نافذة، يكفي جدولتها من جديد.
--    ملاحظة تنفيذية: UPDATE مباشر على cron.job مرفوضٌ صلاحيةً (42501) حتى
--    لعقد الترحيل؛ التعطيل الفعلي نُفِّذ بـ cron.unschedule('prune-queue-events')
--    مباشرةً (يحذف تسجيل الجدولة، لا الدالة) — موثَّقٌ هنا لا في هذا الملف
--    وحده لأن apply_migration نفسه رفض نفس الجملة.

-- ── ١) التبديل يسجّل الطرفين معًا ──
create or replace function public.swap_queue_positions(p_a uuid, p_b uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_first uuid; v_second uuid;
  a_id uuid; a_branch uuid; a_zone text; a_status public.waitlist_status; a_pos int; a_cust uuid; a_name text;
  b_id uuid; b_branch uuid; b_zone text; b_status public.waitlist_status; b_pos int; b_cust uuid; b_name text;
begin
  if p_a is null or p_b is null or p_a = p_b then
    raise exception 'اختر دورين مختلفين' using errcode = 'P0400';
  end if;

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

  select full_name into a_name from public.customers where id = a_cust;
  select full_name into b_name from public.customers where id = b_cust;

  update public.waitlist_entries set "position" = b_pos where id = a_id;
  update public.waitlist_entries set "position" = a_pos where id = b_id;

  insert into public.queue_events
    (branch_id, entry_id, customer_id, kind, zone, from_rank, to_rank, actor, detail)
  values
    (a_branch, a_id, a_cust, 'swapped', a_zone, a_pos, b_pos, (select auth.uid()),
     jsonb_build_object('with_entry', b_id, 'with_name', b_name)),
    (a_branch, b_id, b_cust, 'swapped', a_zone, b_pos, a_pos, (select auth.uid()),
     jsonb_build_object('with_entry', a_id, 'with_name', a_name));

  return jsonb_build_object(
    'ok', true,
    'a', jsonb_build_object('entry', a_id, 'from', a_pos, 'to', b_pos),
    'b', jsonb_build_object('entry', b_id, 'from', b_pos, 'to', a_pos));
end $function$;

-- ── ٢) سجلّ قابل لنطاق تاريخيّ اختياريّ + اسم مقابل التبديل ──
drop function if exists public.branch_day_log(uuid, integer);

create function public.branch_day_log(
  p_branch_id uuid,
  p_limit integer default 50,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table(
  event_id uuid,
  entry_id uuid,
  kind text,
  zone text,
  from_rank integer,
  to_rank integer,
  at timestamptz,
  customer_name text,
  actor_name text,
  counterpart_name text,
  restorable boolean
)
language sql
stable security definer
set search_path to ''
as $function$
  select e.id, e.entry_id, e.kind, e.zone, e.from_rank, e.to_rank, e.at,
         c.full_name,
         s.name,
         case when e.kind = 'swapped' then e.detail->>'with_name' else null end,
         (e.kind in ('cancelled','expired','no_show','seated')
          and e.at > now() - interval '15 minutes'
          and not exists (
            select 1 from public.waitlist_entries w
             where w.branch_id = e.branch_id and w.customer_id = e.customer_id
               and w.status in ('waiting','notified')))
    from public.queue_events e
    left join public.customers c on c.id = e.customer_id
    left join public.staff s on s.user_id = e.actor and s.restaurant_id =
         (select b.restaurant_id from public.branches b where b.id = e.branch_id)
   where e.branch_id = p_branch_id
     and e.at > coalesce(p_from, now() - interval '8 hours')
     and e.at <= coalesce(p_to, now())
     and (public.is_platform_admin()
          or e.branch_id = any (coalesce(public.my_branch_ids_for('waitlist'), array[]::uuid[])))
   order by e.at desc
   limit least(greatest(coalesce(p_limit, 50), 1), case when p_from is null then 200 else 1000 end);
$function$;

revoke all on function public.branch_day_log(uuid, integer, timestamptz, timestamptz) from anon;
revoke all on function public.branch_day_log(uuid, integer, timestamptz, timestamptz) from public;
grant execute on function public.branch_day_log(uuid, integer, timestamptz, timestamptz) to authenticated;

-- ── ٣) تعطيل تنظيف الـ٣٠-يوم ──
-- نُفِّذ فعليًّا عبر: select cron.unschedule('prune-queue-events');
-- (خارج هذا الملف — UPDATE مباشر على cron.job يرتدّ بـ 42501 حتى من صلاحية
-- الترحيل نفسها؛ cron.unschedule هي الواجهة المسموحة الوحيدة).
