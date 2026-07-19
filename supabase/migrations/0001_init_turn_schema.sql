-- ============================================================
--  Turn (تيرن) — Restaurant Reservations & Waitlist Platform
--  سكيمة قاعدة البيانات الكاملة — Supabase / PostgreSQL
--  تشمل: الجداول، العلاقات، القيود، الفهارس، سياسات RLS
--
--  ملاحظة: عمود time_range في reservations عمودٌ tstzrange عادي
--  يُملأ عبر trigger قبل الإدخال/التحديث (وليس generated)،
--  لتجنّب خطأ 42P17 (generation expression is not immutable).
-- ============================================================

-- ----------  إضافات مطلوبة  ----------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "btree_gist";   -- للقيود الزمنية (منع الحجز المزدوج)

-- ============================================================
--  0) أنواع مخصصة (ENUMS)
-- ============================================================
create type user_role       as enum ('owner', 'manager', 'staff', 'host');
create type reservation_status as enum ('pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show');
create type waitlist_status  as enum ('waiting', 'notified', 'seated', 'cancelled', 'no_show', 'expired');
create type table_status     as enum ('available', 'occupied', 'reserved', 'inactive');
create type subscription_status as enum ('trialing', 'active', 'past_due', 'cancelled', 'expired');
create type notification_channel as enum ('sms', 'whatsapp', 'push', 'email');

-- ============================================================
--  1) المطاعم (المستأجر الرئيسي - Tenant)
-- ============================================================
create table restaurants (
    id              uuid primary key default uuid_generate_v4(),
    owner_id        uuid not null references auth.users(id) on delete restrict,
    name            text not null,
    name_en         text,
    slug            text unique not null,          -- للرابط العام: turn.app/r/eficto
    logo_url        text,
    phone           text,
    email           text,
    description     text,
    is_active       boolean not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    constraint slug_format check (slug ~ '^[a-z0-9-]+$')
);

-- ============================================================
--  2) الفروع (كل مطعم له فرع أو أكثر)
-- ============================================================
create table branches (
    id              uuid primary key default uuid_generate_v4(),
    restaurant_id   uuid not null references restaurants(id) on delete cascade,
    name            text not null,                 -- "فرع الروضة"، "الفرع الرئيسي"
    name_en         text,
    address         text,
    city            text,
    lat             double precision,
    lng             double precision,
    phone           text,
    timezone        text not null default 'Asia/Riyadh',
    is_active       boolean not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);
create index idx_branches_restaurant on branches(restaurant_id);

-- ============================================================
--  3) طاقم العمل (بأدوار مربوطة بالمطعم)
-- ============================================================
create table staff (
    id              uuid primary key default uuid_generate_v4(),
    user_id         uuid not null references auth.users(id) on delete cascade,
    restaurant_id   uuid not null references restaurants(id) on delete cascade,
    branch_id       uuid references branches(id) on delete cascade,  -- null = كل الفروع
    role            user_role not null default 'staff',
    is_active       boolean not null default true,
    created_at      timestamptz not null default now(),
    unique (user_id, restaurant_id)
);
create index idx_staff_user on staff(user_id);
create index idx_staff_restaurant on staff(restaurant_id);

-- ============================================================
--  4) الطاولات (تابعة للفرع)
-- ============================================================
create table tables (
    id              uuid primary key default uuid_generate_v4(),
    branch_id       uuid not null references branches(id) on delete cascade,
    label           text not null,                 -- "طاولة 5"، "A1"
    seats           int not null check (seats > 0),
    min_seats       int check (min_seats > 0),
    status          table_status not null default 'available',
    zone            text,                          -- "داخلي"، "خارجي"، "VIP"
    sort_order      int default 0,
    is_active       boolean not null default true,
    created_at      timestamptz not null default now(),
    unique (branch_id, label)
);
create index idx_tables_branch on tables(branch_id);

-- ============================================================
--  5) العملاء (حساب كامل)
--  مربوط بـ auth.users لأن العميل يسجّل دخول
-- ============================================================
create table customers (
    id              uuid primary key default uuid_generate_v4(),
    user_id         uuid unique references auth.users(id) on delete set null,
    full_name       text not null,
    phone           text not null,
    email           text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);
create index idx_customers_user on customers(user_id);
create index idx_customers_phone on customers(phone);

-- ============================================================
--  6) الحجوزات المسبقة
-- ============================================================
create table reservations (
    id              uuid primary key default uuid_generate_v4(),
    branch_id       uuid not null references branches(id) on delete cascade,
    customer_id     uuid not null references customers(id) on delete restrict,
    table_id        uuid references tables(id) on delete set null,
    party_size      int not null check (party_size > 0),
    reserved_at     timestamptz not null,          -- وقت الحجز المطلوب
    duration_min    int not null default 90,       -- المدة المتوقعة للجلسة
    status          reservation_status not null default 'pending',
    notes           text,
    -- فترة زمنية لمنع التعارض على نفس الطاولة.
    -- عمود tstzrange عادي يُملأ عبر trigger (set_reservation_time_range)
    -- قبل الإدخال/التحديث — وليس generated (تجنّبًا لخطأ 42P17).
    time_range      tstzrange,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);
create index idx_reservations_branch on reservations(branch_id);
create index idx_reservations_customer on reservations(customer_id);
create index idx_reservations_reserved_at on reservations(reserved_at);
create index idx_reservations_status on reservations(status);

-- ★ دالة + trigger لتعبئة time_range تلقائياً من reserved_at و duration_min.
--   make_interval ثابتة (immutable) فلا تسبب مشاكل، وتُنفَّذ قبل فحص قيد
--   no_double_booking لأن مُشغّلات BEFORE ROW تسبق فحص قيود الاستبعاد.
create or replace function set_reservation_time_range()
returns trigger language plpgsql as $$
begin
    new.time_range := tstzrange(
        new.reserved_at,
        new.reserved_at + make_interval(mins => new.duration_min)
    );
    return new;
end;
$$;

create trigger t_reservations_time_range
    before insert or update of reserved_at, duration_min on reservations
    for each row execute function set_reservation_time_range();

-- ★ القيد الأهم: منع الحجز المزدوج على نفس الطاولة في نفس الوقت
-- يعمل على مستوى القاعدة نفسها — لا يمكن تجاوزه حتى لو أخطأ الكود
alter table reservations
    add constraint no_double_booking
    exclude using gist (
        table_id with =,
        time_range with &&
    )
    where (table_id is not null and status in ('pending','confirmed','seated'));

-- ============================================================
--  7) قائمة الانتظار (Walk-in)
-- ============================================================
create table waitlist_entries (
    id              uuid primary key default uuid_generate_v4(),
    branch_id       uuid not null references branches(id) on delete cascade,
    customer_id     uuid not null references customers(id) on delete restrict,
    party_size      int not null check (party_size > 0),
    status          waitlist_status not null default 'waiting',
    position        int,                           -- الترتيب في الطابور
    quoted_wait_min int,                           -- الوقت المتوقع المعطى للعميل
    joined_at       timestamptz not null default now(),
    notified_at     timestamptz,
    seated_at       timestamptz,
    table_id        uuid references tables(id) on delete set null,
    notes           text,
    updated_at      timestamptz not null default now()
);
create index idx_waitlist_branch on waitlist_entries(branch_id);
create index idx_waitlist_status on waitlist_entries(status);
create index idx_waitlist_customer on waitlist_entries(customer_id);
-- فهرس للطابور النشط لكل فرع (استعلام متكرر جداً)
create index idx_waitlist_active on waitlist_entries(branch_id, position)
    where status in ('waiting','notified');

-- ============================================================
--  8) إعدادات الفرع (طبقة مرنة — ميزتك التنافسية)
--  jsonb يسمح بإضافة إعدادات جديدة دون تعديل السكيمة
-- ============================================================
create table branch_settings (
    branch_id           uuid primary key references branches(id) on delete cascade,
    accepts_reservations boolean not null default true,
    accepts_waitlist    boolean not null default true,
    max_party_size      int not null default 20,
    default_duration_min int not null default 90,
    -- ★ لا رسوم على العميل افتراضياً (عكس ريكيو)
    charge_customer     boolean not null default false,
    grace_period_min    int not null default 15,   -- بدون رسوم/إلغاء تلقائي
    opening_hours       jsonb default '{}'::jsonb, -- ساعات العمل لكل يوم
    booking_window_days int not null default 30,   -- كم يوم مقدماً يمكن الحجز
    notification_channels notification_channel[] default array['sms']::notification_channel[],
    custom              jsonb default '{}'::jsonb, -- أي إعداد مستقبلي
    updated_at          timestamptz not null default now()
);

-- ============================================================
--  9) الاشتراكات (الفوترة على المطعم)
-- ============================================================
create table subscriptions (
    id              uuid primary key default uuid_generate_v4(),
    restaurant_id   uuid not null references restaurants(id) on delete cascade,
    plan            text not null default 'trial', -- trial / basic / pro
    status          subscription_status not null default 'trialing',
    started_at      timestamptz not null default now(),
    current_period_end timestamptz,
    moyasar_id      text,                          -- معرّف الاشتراك في ميسر
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);
create index idx_subscriptions_restaurant on subscriptions(restaurant_id);

-- ============================================================
--  10) سجل الإشعارات (للتتبع والموثوقية)
-- ============================================================
create table notifications (
    id              uuid primary key default uuid_generate_v4(),
    branch_id       uuid not null references branches(id) on delete cascade,
    customer_id     uuid references customers(id) on delete set null,
    channel         notification_channel not null,
    template        text not null,                 -- "table_ready", "reminder"
    payload         jsonb,
    sent_at         timestamptz,
    delivered       boolean default false,
    error           text,
    created_at      timestamptz not null default now()
);
create index idx_notifications_branch on notifications(branch_id);
create index idx_notifications_customer on notifications(customer_id);

-- ============================================================
--  11) دوال مساعدة (تُستخدم داخل سياسات RLS)
-- ============================================================

-- هل المستخدم الحالي عضو طاقم في هذا المطعم؟
create or replace function is_staff_of(rest_id uuid)
returns boolean
language sql security definer stable
as $$
    select exists (
        select 1 from staff
        where staff.user_id = auth.uid()
          and staff.restaurant_id = rest_id
          and staff.is_active = true
    );
$$;

-- هل المستخدم مالك أو مدير في هذا المطعم؟
create or replace function is_manager_of(rest_id uuid)
returns boolean
language sql security definer stable
as $$
    select exists (
        select 1 from staff
        where staff.user_id = auth.uid()
          and staff.restaurant_id = rest_id
          and staff.role in ('owner','manager')
          and staff.is_active = true
    );
$$;

-- الحصول على restaurant_id من branch_id
create or replace function restaurant_of_branch(b_id uuid)
returns uuid
language sql security definer stable
as $$
    select restaurant_id from branches where id = b_id;
$$;

-- ============================================================
--  12) تفعيل RLS على كل الجداول
--  ★ خط الدفاع الأساسي — عزل تام بين المطاعم
-- ============================================================
alter table restaurants      enable row level security;
alter table branches         enable row level security;
alter table staff            enable row level security;
alter table tables           enable row level security;
alter table customers        enable row level security;
alter table reservations     enable row level security;
alter table waitlist_entries enable row level security;
alter table branch_settings  enable row level security;
alter table subscriptions    enable row level security;
alter table notifications    enable row level security;

-- ----------  سياسات: المطاعم  ----------
create policy "staff read own restaurant" on restaurants
    for select using (is_staff_of(id));
create policy "owner manages restaurant" on restaurants
    for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ----------  سياسات: الفروع  ----------
create policy "staff read branches" on branches
    for select using (is_staff_of(restaurant_id));
create policy "managers manage branches" on branches
    for all using (is_manager_of(restaurant_id))
    with check (is_manager_of(restaurant_id));
-- العميل يقدر يشوف الفروع النشطة (للحجز)
create policy "public read active branches" on branches
    for select using (is_active = true);

-- ----------  سياسات: الطاقم  ----------
create policy "staff read team" on staff
    for select using (is_staff_of(restaurant_id));
create policy "managers manage team" on staff
    for all using (is_manager_of(restaurant_id))
    with check (is_manager_of(restaurant_id));

-- ----------  سياسات: الطاولات  ----------
create policy "staff read tables" on tables
    for select using (is_staff_of(restaurant_of_branch(branch_id)));
create policy "managers manage tables" on tables
    for all using (is_manager_of(restaurant_of_branch(branch_id)))
    with check (is_manager_of(restaurant_of_branch(branch_id)));

-- ----------  سياسات: العملاء  ----------
-- العميل يشوف/يعدّل بياناته فقط
create policy "customer reads self" on customers
    for select using (user_id = auth.uid());
create policy "customer updates self" on customers
    for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "customer inserts self" on customers
    for insert with check (user_id = auth.uid());

-- ----------  سياسات: الحجوزات  ----------
-- العميل يشوف حجوزاته
create policy "customer reads own reservations" on reservations
    for select using (
        customer_id in (select id from customers where user_id = auth.uid())
    );
create policy "customer creates reservation" on reservations
    for insert with check (
        customer_id in (select id from customers where user_id = auth.uid())
    );
create policy "customer cancels own reservation" on reservations
    for update using (
        customer_id in (select id from customers where user_id = auth.uid())
    );
-- الطاقم يدير حجوزات فرعه
create policy "staff manages branch reservations" on reservations
    for all using (is_staff_of(restaurant_of_branch(branch_id)))
    with check (is_staff_of(restaurant_of_branch(branch_id)));

-- ----------  سياسات: قائمة الانتظار  ----------
create policy "customer reads own waitlist" on waitlist_entries
    for select using (
        customer_id in (select id from customers where user_id = auth.uid())
    );
create policy "customer joins waitlist" on waitlist_entries
    for insert with check (
        customer_id in (select id from customers where user_id = auth.uid())
    );
create policy "staff manages branch waitlist" on waitlist_entries
    for all using (is_staff_of(restaurant_of_branch(branch_id)))
    with check (is_staff_of(restaurant_of_branch(branch_id)));

-- ----------  سياسات: الإعدادات  ----------
create policy "staff reads settings" on branch_settings
    for select using (is_staff_of(restaurant_of_branch(branch_id)));
create policy "managers manage settings" on branch_settings
    for all using (is_manager_of(restaurant_of_branch(branch_id)))
    with check (is_manager_of(restaurant_of_branch(branch_id)));

-- ----------  سياسات: الاشتراكات  ----------
create policy "managers read subscription" on subscriptions
    for select using (is_manager_of(restaurant_id));
-- التعديل يتم فقط عبر service_role (webhook ميسر) — لا سياسة كتابة للمستخدمين

-- ----------  سياسات: الإشعارات  ----------
create policy "staff reads notifications" on notifications
    for select using (is_staff_of(restaurant_of_branch(branch_id)));

-- ============================================================
--  13) دالة تحديث updated_at تلقائياً
-- ============================================================
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger t_restaurants  before update on restaurants      for each row execute function touch_updated_at();
create trigger t_branches     before update on branches         for each row execute function touch_updated_at();
create trigger t_customers    before update on customers        for each row execute function touch_updated_at();
create trigger t_reservations before update on reservations     for each row execute function touch_updated_at();
create trigger t_waitlist     before update on waitlist_entries for each row execute function touch_updated_at();
create trigger t_settings     before update on branch_settings  for each row execute function touch_updated_at();
create trigger t_subs         before update on subscriptions    for each row execute function touch_updated_at();

-- ============================================================
--  انتهت السكيمة
-- ============================================================
