-- ============================================================================
--  المرحلة ٢ — فصل المحتوى لكل فرع: القائمة والعروض والصور.
--  الهدف: كل فرع كأنه مطعم مستقل (فرانشايز) — قائمته وعروضه وصوره الخاصة.
--
--  قرار تصميمي: نُبقي restaurant_id كما هو لأنه مرساة العزل في RLS (لا تتغيّر
--  أي سياسة)، ونضيف branch_id للفصل داخل المطعم — نفس نمط waitlist_entries.
--
--  الترحيل غير هدّام: المحتوى الحالي يُنسخ إلى **كل** فرع، فلا يتغيّر شيء ظاهريًّا
--  اليوم، ثم يستطيع كل فرع أن يحرّر نسخته ويتمايز.
-- ============================================================================

-- ١) الأعمدة (تُترك nullable حتى يكتمل الترحيل)
alter table public.menu_categories   add column if not exists branch_id uuid references public.branches(id) on delete cascade;
alter table public.menu_items        add column if not exists branch_id uuid references public.branches(id) on delete cascade;
alter table public.offers            add column if not exists branch_id uuid references public.branches(id) on delete cascade;
alter table public.restaurant_photos add column if not exists branch_id uuid references public.branches(id) on delete cascade;

-- عمود مساعد مؤقّت: يربط القسم المنسوخ بأصله كي تُعاد إحالة الأصناف بدقّة
alter table public.menu_categories add column if not exists copied_from uuid;

-- ٢) الفرع الأول لكل مطعم يرث الصفوف القائمة
with fb as (
  select distinct on (restaurant_id) restaurant_id, id as branch_id
  from public.branches order by restaurant_id, created_at
)
update public.menu_categories m set branch_id = fb.branch_id
from fb where fb.restaurant_id = m.restaurant_id and m.branch_id is null;

with fb as (
  select distinct on (restaurant_id) restaurant_id, id as branch_id
  from public.branches order by restaurant_id, created_at
)
update public.menu_items m set branch_id = fb.branch_id
from fb where fb.restaurant_id = m.restaurant_id and m.branch_id is null;

with fb as (
  select distinct on (restaurant_id) restaurant_id, id as branch_id
  from public.branches order by restaurant_id, created_at
)
update public.offers o set branch_id = fb.branch_id
from fb where fb.restaurant_id = o.restaurant_id and o.branch_id is null;

with fb as (
  select distinct on (restaurant_id) restaurant_id, id as branch_id
  from public.branches order by restaurant_id, created_at
)
update public.restaurant_photos p set branch_id = fb.branch_id
from fb where fb.restaurant_id = p.restaurant_id and p.branch_id is null;

-- ٣) نسخ المحتوى إلى الفروع الإضافية (فروع المطعم عدا الأول)
--    الأقسام أولًا مع تتبّع الأصل، ثم الأصناف بإحالة مُعاد ربطها.
with fb as (
  select distinct on (restaurant_id) restaurant_id, id as branch_id
  from public.branches order by restaurant_id, created_at
),
extra as (
  select b.id as branch_id, b.restaurant_id
  from public.branches b join fb on fb.restaurant_id = b.restaurant_id
  where b.id <> fb.branch_id
)
insert into public.menu_categories (restaurant_id, branch_id, name, sort_order, copied_from)
select c.restaurant_id, e.branch_id, c.name, c.sort_order, c.id
from public.menu_categories c
join extra e on e.restaurant_id = c.restaurant_id
where c.copied_from is null;

-- الأصناف: تُنسخ لكل فرع إضافي، وتُحال إلى نسخة القسم في نفس الفرع
insert into public.menu_items
  (restaurant_id, branch_id, category_id, name, description, price, image_url, is_available, sort_order)
select i.restaurant_id, nc.branch_id, nc.id, i.name, i.description, i.price,
       i.image_url, i.is_available, i.sort_order
from public.menu_items i
join public.menu_categories nc on nc.copied_from = i.category_id
where i.category_id is not null;

-- أصناف بلا قسم: تُنسخ مباشرة لكل فرع إضافي
with fb as (
  select distinct on (restaurant_id) restaurant_id, id as branch_id
  from public.branches order by restaurant_id, created_at
),
extra as (
  select b.id as branch_id, b.restaurant_id
  from public.branches b join fb on fb.restaurant_id = b.restaurant_id
  where b.id <> fb.branch_id
)
insert into public.menu_items
  (restaurant_id, branch_id, category_id, name, description, price, image_url, is_available, sort_order)
select i.restaurant_id, e.branch_id, null, i.name, i.description, i.price,
       i.image_url, i.is_available, i.sort_order
from public.menu_items i
join extra e on e.restaurant_id = i.restaurant_id
join fb on fb.restaurant_id = i.restaurant_id
where i.category_id is null and i.branch_id = fb.branch_id;

with fb as (
  select distinct on (restaurant_id) restaurant_id, id as branch_id
  from public.branches order by restaurant_id, created_at
),
extra as (
  select b.id as branch_id, b.restaurant_id
  from public.branches b join fb on fb.restaurant_id = b.restaurant_id
  where b.id <> fb.branch_id
)
insert into public.offers
  (restaurant_id, branch_id, title, description, kind, value, code, audience, conditions,
   starts_at, ends_at, total_limit, per_customer_limit, is_active)
select o.restaurant_id, e.branch_id, o.title, o.description, o.kind, o.value,
       -- الرمز فريد غالبًا: نميّزه بلاحقة الفرع لتفادي التعارض
       case when o.code is null then null else o.code || '-' || left(replace(e.branch_id::text,'-',''), 4) end,
       o.audience, o.conditions, o.starts_at, o.ends_at, o.total_limit,
       o.per_customer_limit, o.is_active
from public.offers o
join extra e on e.restaurant_id = o.restaurant_id
join fb on fb.restaurant_id = o.restaurant_id
where o.branch_id = fb.branch_id;

with fb as (
  select distinct on (restaurant_id) restaurant_id, id as branch_id
  from public.branches order by restaurant_id, created_at
),
extra as (
  select b.id as branch_id, b.restaurant_id
  from public.branches b join fb on fb.restaurant_id = b.restaurant_id
  where b.id <> fb.branch_id
)
insert into public.restaurant_photos (restaurant_id, branch_id, url, caption, sort_order)
select p.restaurant_id, e.branch_id, p.url, p.caption, p.sort_order
from public.restaurant_photos p
join extra e on e.restaurant_id = p.restaurant_id
join fb on fb.restaurant_id = p.restaurant_id
where p.branch_id = fb.branch_id;

-- ٤) إلزام العمود بعد اكتمال الترحيل + فهارس
alter table public.menu_categories   alter column branch_id set not null;
alter table public.menu_items        alter column branch_id set not null;
alter table public.offers            alter column branch_id set not null;
alter table public.restaurant_photos alter column branch_id set not null;

create index if not exists menu_categories_branch_idx   on public.menu_categories (branch_id);
create index if not exists menu_items_branch_idx        on public.menu_items (branch_id);
create index if not exists offers_branch_idx            on public.offers (branch_id);
create index if not exists restaurant_photos_branch_idx on public.restaurant_photos (branch_id);

-- ٥) إسقاط العمود المساعد
alter table public.menu_categories drop column if exists copied_from;
