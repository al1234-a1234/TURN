-- ============================================================================
--  «امسح خذ هديتك» لكل فرع: إعدادات الهدية + ملصق QR خاص بكل فرع.
--  restaurant_id يبقى مرساة RLS، والمفتاح الأساسي يصير branch_id.
--
--  مهم: ترتيب العمليات — يُسقط المفتاح القديم (على restaurant_id) **قبل** نسخ
--  الإعداد لبقية الفروع، وإلا خالف النسخُ المفتاحَ القديم.
-- ============================================================================
alter table public.checkin_settings
  add column if not exists branch_id uuid references public.branches(id) on delete cascade;

with fb as (
  select distinct on (restaurant_id) restaurant_id, id as branch_id
  from public.branches order by restaurant_id, created_at
)
update public.checkin_settings s set branch_id = fb.branch_id
from fb where fb.restaurant_id = s.restaurant_id and s.branch_id is null;

alter table public.checkin_settings drop constraint if exists checkin_settings_pkey;

with fb as (
  select distinct on (restaurant_id) restaurant_id, id as branch_id
  from public.branches order by restaurant_id, created_at
),
extra as (
  select b.id as branch_id, b.restaurant_id
  from public.branches b join fb on fb.restaurant_id = b.restaurant_id
  where b.id <> fb.branch_id
)
insert into public.checkin_settings
  (restaurant_id, branch_id, welcome_enabled, welcome_kind, welcome_title,
   welcome_value, welcome_value_kind, welcome_expires_days)
select s.restaurant_id, e.branch_id, s.welcome_enabled, s.welcome_kind, s.welcome_title,
       s.welcome_value, s.welcome_value_kind, s.welcome_expires_days
from public.checkin_settings s
join extra e on e.restaurant_id = s.restaurant_id
join fb on fb.restaurant_id = s.restaurant_id
where s.branch_id = fb.branch_id;

alter table public.checkin_settings alter column branch_id set not null;
alter table public.checkin_settings add primary key (branch_id);
create index if not exists checkin_settings_restaurant_idx on public.checkin_settings (restaurant_id);
