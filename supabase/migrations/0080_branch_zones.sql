-- ============================================================================
--  الأقسام يعرّفها المالك — لا «داخلي/خارجي» مثبّتين في الكود
--
--  كان القسم قيمتين اثنتين لا ثالث لهما: عَلَمان في branch_settings
--  (has_inside/has_outside) وقيدُ CHECK يحصر waitlist_entries.zone في
--  ‏('any','inside','outside'). فمطعمٌ عنده «عوائل» و«أفراد» — وهو أشيع
--  تقسيمٍ في مطاعم السعودية، أشيع من داخلي/خارجي — لا يستطيع تمثيله.
--
--  التصميم المختار هو الأقلّ خطرًا: القسم يبقى **نصًّا** في `tables.zone`
--  و`waitlist_entries.zone` كما هو، ويصير هذا النصّ **مفتاحًا** لصفٍّ في
--  جدول `branch_zones` يحمل اسمه وترتيبه وحالته.
--
--  ولهذا الاختيار ثمنٌ رخيص ومكسبٌ كبير: كل الدوالّ التي تقارن النصّ
--  ‏(pick_table_for, join_waitlist_guest, staff_add_walkin, reservation_slots)
--  تظلّ تعمل بلا تعديلٍ في منطقها — إنما نرفع عنها حصر القيمتين. ولا صفَّ
--  واحدًا يُنقَل ولا عمودَ مفتاحٍ أجنبيّ يُضاف إلى جدولٍ حيّ فيه طوابير قائمة.
-- ============================================================================

-- ── ١) الجدول ─────────────────────────────────────────────────────────────
create table if not exists public.branch_zones (
  id         uuid primary key default uuid_generate_v4(),
  branch_id  uuid not null references public.branches(id) on delete cascade,
  -- المفتاح هو ما يُخزَّن في tables.zone و waitlist_entries.zone. ثابتٌ لا
  -- يتغيّر بتغيّر الاسم — إعادة تسمية «خارجي» إلى «التراس» يجب ألّا تيتّم
  -- طاولاته ولا أدوار الطابور القائمة عليه.
  key        text not null check (key ~ '^[a-z0-9_]{2,24}$'),
  name       text not null check (btrim(name) <> ''),
  name_en    text,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (branch_id, key)
);

create index if not exists idx_branch_zones_branch on public.branch_zones (branch_id, sort_order);

-- ── ٢) نقل ما هو قائم ─────────────────────────────────────────────────────
-- لكل فرعٍ قسمٌ لكل عَلَمٍ مرفوع، **أو** لكل قسمٍ فيه طاولاتٌ فعلًا: فرعٌ
-- أطفأ العَلَم وبقيت له طاولات لا يجوز أن يفقدها.
insert into public.branch_zones (branch_id, key, name, name_en, sort_order)
select b.id, 'inside', 'داخلي', 'Indoor', 1
from public.branches b
left join public.branch_settings bs on bs.branch_id = b.id
where coalesce(bs.has_inside, true)
   or exists (select 1 from public.tables t where t.branch_id = b.id and t.zone = 'inside')
on conflict (branch_id, key) do nothing;

insert into public.branch_zones (branch_id, key, name, name_en, sort_order)
select b.id, 'outside', 'خارجي', 'Outdoor', 2
from public.branches b
left join public.branch_settings bs on bs.branch_id = b.id
where coalesce(bs.has_outside, true)
   or exists (select 1 from public.tables t where t.branch_id = b.id and t.zone = 'outside')
on conflict (branch_id, key) do nothing;

-- ── ٣) رفع الحصر ──────────────────────────────────────────────────────────
-- القيد كان يمنع أيّ قسمٍ ثالث من الوجود أصلًا. يُستبدَل بقيد شكلٍ فقط:
-- الصحّة الحقيقية (أن المفتاح يخصّ هذا الفرع) يفرضها الحارس أدناه، لأن
-- ‏CHECK لا يستطيع النظر في جدولٍ آخر.
alter table public.waitlist_entries drop constraint if exists waitlist_entries_zone_check;
alter table public.waitlist_entries add constraint waitlist_entries_zone_check
  check (zone is null or zone ~ '^[a-z0-9_]{2,24}$');

-- ── ٤) حارس: لا قسمَ من خارج الفرع ────────────────────────────────────────
-- بلا هذا يستطيع نداءٌ مباشر أن يضع دورًا في قسمٍ لا وجود له، فيختفي الدور
-- من كل أعمدة الاستقبال ويقف صاحبه بلا أن يُنادى.
create or replace function public.enforce_zone_belongs_to_branch()
returns trigger
language plpgsql
security definer
set search_path to ''
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

  -- يُقصّ إلى أوّل قسمٍ فعّال ولا يُرفض: ردّ عميلٍ واقفٍ على الباب لأجل
  -- مفتاحٍ خاطئ أسوأ من إجلاسه في القسم الافتراضي. (نفس مبدأ resolveZone.)
  select z.key into v_fallback
  from public.branch_zones z
  where z.branch_id = new.branch_id and z.is_active
  order by z.sort_order, z.created_at
  limit 1;

  new.zone := v_fallback;
  return new;
end;
$$;

drop trigger if exists trg_waitlist_zone_belongs on public.waitlist_entries;
create trigger trg_waitlist_zone_belongs
  before insert or update of zone, branch_id on public.waitlist_entries
  for each row execute function public.enforce_zone_belongs_to_branch();

drop trigger if exists trg_tables_zone_belongs on public.tables;
create trigger trg_tables_zone_belongs
  before insert or update of zone, branch_id on public.tables
  for each row execute function public.enforce_zone_belongs_to_branch();

-- ── ٥) عدّاد الطابور لكل قسم ──────────────────────────────────────────────
-- ‏waitlist_counts_for تُرجع عمودَي inside/outside ثابتين — أي أن قسمًا ثالثًا
-- لا يُعدّ. هذه تُرجع صفًّا لكل قسم، وتبقى تلك كما هي حتى تنتقل كل الشاشات.
create or replace function public.waitlist_counts_by_zone(p_branch_ids uuid[])
returns table (branch_id uuid, zone_key text, waiting bigint)
language sql
stable
security definer
set search_path to ''
as $$
  select w.branch_id, w.zone, count(*)
  from public.waitlist_entries w
  where w.status in ('waiting', 'notified')
    and w.branch_id = any(p_branch_ids)
  group by w.branch_id, w.zone;
$$;

grant execute on function public.waitlist_counts_by_zone(uuid[]) to anon, authenticated, service_role;

-- ── ٦) الأقسام تُقرأ علنًا، ولا يعدّلها إلا مديرٌ لمطعمها ─────────────────
alter table public.branch_zones enable row level security;

drop policy if exists "branch zones are public" on public.branch_zones;
create policy "branch zones are public"
  on public.branch_zones for select
  using (true);

drop policy if exists "managers manage branch zones" on public.branch_zones;
create policy "managers manage branch zones"
  on public.branch_zones for all
  using (public.is_manager_of(public.restaurant_of_branch(branch_id)))
  with check (public.is_manager_of(public.restaurant_of_branch(branch_id)));

grant select on public.branch_zones to anon, authenticated;
grant insert, update, delete on public.branch_zones to authenticated;
