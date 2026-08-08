-- ═══════════════════════════════════════════════════════════════════
--  فرعٌ جديد بلا أقسام كان يقتل طابوره كلّه.
--
--  0080 رحّل الفروع القائمة إلى branch_zones، ولم يضع شيئًا للفروع التي
--  تُنشأ بعده. والحارس (enforce_zone_belongs_to_branch) يقصّ أيّ قسمٍ
--  غريب إلى «أوّل قسمٍ فعّال» — وحين لا يوجد ولا واحد يكتب NULL في عمودٍ
--  NOT NULL، فيفشل كل انضمام.
--
--  الأثر: كل مطعمٍ جديد يُفتح له فرع، يمسح عميله الباركود، فلا يستطيع
--  أخذ دورٍ أبدًا. لا رسالة مفهومة — فشلٌ خام في القاعدة. اكتُشف قبل
--  تسليمٍ ميدانيّ بيومين، باختبارٍ أنشأ فرعًا جديدًا وحاول الانضمام إليه.
--
--  يُصلَح من طرفين: منبعًا (كل فرع يولد بأقسامه) وحارسًا (لا يمحو ما لا
--  بديل له). أيّهما وحده يكفي، لكنّ الاثنين معًا يمنعان عودة العطب من
--  طريقٍ لم نتوقّعه — كفرعٍ حُذفت أقسامه يدويًّا.
--
--  (طُبِّق على الإنتاج باسم 0081_default_zones_for_new_branches.)
-- ═══════════════════════════════════════════════════════════════════

-- ── ١) كل فرعٍ جديد يولد بقسمين، كما يولد بإعداداته ──
create or replace function public.create_default_branch_zones()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- «داخلي/خارجي» نقطة بداية لا حكم نهائيّ: المالك يعيد تسميتهما ويضيف
  -- إليهما من صفحة الطاولات، والمفتاح يثبت فلا تيتّم إعادةُ التسمية شيئًا.
  insert into public.branch_zones (branch_id, key, name, name_en, sort_order)
  values (new.id, 'inside',  'داخلي', 'Indoor',  1),
         (new.id, 'outside', 'خارجي', 'Outdoor', 2)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists t_branch_default_zones on public.branches;
create trigger t_branch_default_zones
after insert on public.branches
for each row execute function public.create_default_branch_zones();

-- ── ٢) الحارس لا يمحو قيمةً لا بديل لها ──
create or replace function public.enforce_zone_belongs_to_branch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fallback text;
begin
  if new.zone is null or new.zone = 'any' then return new; end if;

  if exists (
    select 1 from public.branch_zones z
    where z.branch_id = new.branch_id and z.key = new.zone and z.is_active
  ) then
    return new;
  end if;

  select z.key into v_fallback
  from public.branch_zones z
  where z.branch_id = new.branch_id and z.is_active
  order by z.sort_order, z.created_at
  limit 1;

  -- فرعٌ بلا أقسامٍ فعّالة: نُبقي ما أرسله المستدعي بدل أن نكتب فراغًا
  -- في عمودٍ NOT NULL فيموت الإدخال. قسمٌ غير معرّفٍ أهون من طابورٍ ميت.
  if v_fallback is null then return new; end if;

  new.zone := v_fallback;
  return new;
end;
$$;

-- ── ٣) وفروعٌ قائمة بلا أقسام (إن وُجدت) تُعالَج بأثرٍ رجعيّ ──
insert into public.branch_zones (branch_id, key, name, name_en, sort_order)
select b.id, 'inside', 'داخلي', 'Indoor', 1
from public.branches b
where not exists (select 1 from public.branch_zones z where z.branch_id = b.id)
on conflict do nothing;

insert into public.branch_zones (branch_id, key, name, name_en, sort_order)
select b.id, 'outside', 'خارجي', 'Outdoor', 2
from public.branches b
where not exists (
  select 1 from public.branch_zones z where z.branch_id = b.id and z.key <> 'inside'
)
on conflict do nothing;
