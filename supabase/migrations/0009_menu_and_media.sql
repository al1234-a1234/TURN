-- ============================================================
--  المنيو + الوسائط (صور) + تحكّم صاحب المطعم
--  - صورة غلاف للمطعم
--  - جداول أصناف المنيو (فئات + أطباق بصور وأسعار)
--  - bucket تخزين عام للصور مع صلاحيات (المدير يرفع لمجلّد مطعمه، قراءة عامة)
-- ============================================================

-- 1) صورة غلاف للمطعم
alter table restaurants add column if not exists cover_url text;

-- 2) فئات المنيو
create table if not exists menu_categories (
    id            uuid primary key default uuid_generate_v4(),
    restaurant_id uuid not null references restaurants(id) on delete cascade,
    name          text not null,
    sort_order    int not null default 0,
    created_at    timestamptz not null default now()
);
create index if not exists idx_menu_categories_restaurant on menu_categories(restaurant_id);

-- 3) أطباق المنيو
create table if not exists menu_items (
    id            uuid primary key default uuid_generate_v4(),
    restaurant_id uuid not null references restaurants(id) on delete cascade,
    category_id   uuid not null references menu_categories(id) on delete cascade,
    name          text not null,
    description   text,
    price         numeric(10,2),
    image_url     text,
    is_available  boolean not null default true,
    sort_order    int not null default 0,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);
create index if not exists idx_menu_items_restaurant on menu_items(restaurant_id);
create index if not exists idx_menu_items_category on menu_items(category_id);

create trigger t_menu_items before update on menu_items
    for each row execute function touch_updated_at();

-- 4) RLS للمنيو: قراءة عامة، والإدارة لمدير المطعم
alter table menu_categories enable row level security;
alter table menu_items      enable row level security;

create policy "public read menu categories" on menu_categories
    for select using (true);
create policy "managers manage menu categories" on menu_categories
    for all using (is_manager_of(restaurant_id))
    with check (is_manager_of(restaurant_id));

create policy "public read menu items" on menu_items
    for select using (true);
create policy "managers manage menu items" on menu_items
    for all using (is_manager_of(restaurant_id))
    with check (is_manager_of(restaurant_id));

-- 5) bucket تخزين الصور (عام للقراءة)
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

-- 6) صلاحيات التخزين: قراءة عامة + كتابة المدير في مجلّد مطعمه
--    مسار الملف: restaurants/<restaurant_id>/<file>
drop policy if exists "public read media" on storage.objects;
create policy "public read media" on storage.objects
    for select using (bucket_id = 'media');

drop policy if exists "managers upload media" on storage.objects;
create policy "managers upload media" on storage.objects
    for insert to authenticated
    with check (
        bucket_id = 'media'
        and (storage.foldername(name))[1] = 'restaurants'
        and is_manager_of(((storage.foldername(name))[2])::uuid)
    );

drop policy if exists "managers update media" on storage.objects;
create policy "managers update media" on storage.objects
    for update to authenticated
    using (
        bucket_id = 'media'
        and (storage.foldername(name))[1] = 'restaurants'
        and is_manager_of(((storage.foldername(name))[2])::uuid)
    );

drop policy if exists "managers delete media" on storage.objects;
create policy "managers delete media" on storage.objects
    for delete to authenticated
    using (
        bucket_id = 'media'
        and (storage.foldername(name))[1] = 'restaurants'
        and is_manager_of(((storage.foldername(name))[2])::uuid)
    );
