-- ============================================================
--  نموذج الأدمِن + التسليم (Provisioning)
--
--  الفكرة (طلب المالك): المنصّة مصدر دخل — لا يُسمح لأي أحد
--  بإنشاء مطعم بنفسه. الأدمِن (أنت) وحده يضيف المطاعم، ويسلّم
--  لكل صاحب مطعم "رمز تسليم" خاص (claim_code) أو يربطه بإيميله.
--  صاحب المطعم يُطالِب بالرمز فيصبح مالكًا، ويدير مطعمه فقط
--  (المنيو والصور والطابور) — دون قدرة على إضافة مطاعم جديدة.
-- ============================================================

-- 1) جدول أدمِن المنصّة + دالة تحقّق
create table if not exists platform_admins (
    user_id    uuid primary key references auth.users(id) on delete cascade,
    created_at timestamptz not null default now()
);
alter table platform_admins enable row level security;

-- (لا سياسات SELECT عامة — يُقرأ فقط عبر الدالة أدناه)

create or replace function is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
    select exists (
        select 1 from public.platform_admins
        where user_id = auth.uid()
    );
$$;
grant execute on function is_platform_admin() to authenticated;

-- زرع حساب الأدمِن (أنت)
insert into platform_admins (user_id)
values ('aa12b314-50dc-4785-a7a7-0c52b1098f62')
on conflict (user_id) do nothing;

-- 2) رمز التسليم على المطعم
alter table restaurants add column if not exists claim_code text unique;
alter table restaurants add column if not exists claimed_at timestamptz;

-- مولّد رمز قصير مقروء (8 خانات، بلا أحرف ملتبسة)
create or replace function gen_claim_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
    alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    code text := '';
    i int;
begin
    loop
        code := '';
        for i in 1..8 loop
            code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
        end loop;
        exit when not exists (select 1 from public.restaurants where claim_code = code);
    end loop;
    return code;
end;
$$;

-- 3) إنشاء مطعم + فرع (أدمِن فقط) — يُرجع رمز التسليم
create or replace function admin_create_restaurant(
    p_name text,
    p_slug text,
    p_branch_name text default 'الفرع الرئيسي',
    p_name_en text default null,
    p_owner_email text default null,
    p_city text default null,
    p_address text default null
)
returns table (slug text, claim_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_uid uuid := auth.uid();
    v_rest_id uuid;
    v_code text;
    v_owner uuid;
begin
    if not public.is_platform_admin() then
        raise exception 'غير مصرّح — الأدمِن فقط' using errcode = '42501';
    end if;

    v_code := public.gen_claim_code();

    -- إن توفّر إيميل مطابق لحساب موجود، اربطه مالكًا فورًا
    if p_owner_email is not null and length(trim(p_owner_email)) > 0 then
        select id into v_owner from auth.users
         where lower(email) = lower(trim(p_owner_email))
         limit 1;
    end if;

    -- المالك المبدئي = المالك المُربَط إن وُجد، وإلا الأدمِن (لحين المطالبة)
    insert into public.restaurants (owner_id, name, name_en, slug, email, claim_code, claimed_at)
        values (
            coalesce(v_owner, v_uid),
            p_name, p_name_en, p_slug,
            nullif(trim(p_owner_email), ''),
            case when v_owner is null then v_code else null end,
            case when v_owner is null then null else now() end
        )
        returning id into v_rest_id;

    insert into public.staff (user_id, restaurant_id, role)
        values (coalesce(v_owner, v_uid), v_rest_id, 'owner')
        on conflict (user_id, restaurant_id) do nothing;

    insert into public.branches (restaurant_id, name, city, address)
        values (v_rest_id, p_branch_name, p_city, p_address);

    return query select p_slug, case when v_owner is null then v_code else null end;
end;
$$;
grant execute on function admin_create_restaurant(
    text, text, text, text, text, text, text
) to authenticated;

-- 4) المطالبة بمطعم عبر رمز التسليم — صاحب المطعم يصبح المالك
create or replace function claim_restaurant(p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_uid uuid := auth.uid();
    v_rest public.restaurants%rowtype;
begin
    if v_uid is null then
        raise exception 'يجب تسجيل الدخول' using errcode = '28000';
    end if;

    select * into v_rest from public.restaurants
     where claim_code = upper(trim(p_code))
     limit 1;

    if v_rest.id is null then
        raise exception 'رمز غير صحيح أو مُستخدَم مسبقًا' using errcode = 'P0002';
    end if;

    update public.restaurants
       set owner_id = v_uid, claim_code = null, claimed_at = now()
     where id = v_rest.id;

    insert into public.staff (user_id, restaurant_id, role)
        values (v_uid, v_rest.id, 'owner')
        on conflict (user_id, restaurant_id) do nothing;

    return v_rest.slug;
end;
$$;
grant execute on function claim_restaurant(text) to authenticated;

-- 5) إغلاق الإنشاء الذاتي نهائيًا
revoke execute on function create_restaurant_with_branch(
    text, text, text, text, text, text, text, text
) from authenticated;

-- منع أي أحد من إدراج مطعم مباشرةً؛ المالك يُحدّث/يقرأ مطعمه فقط
drop policy if exists "owner manages restaurant" on restaurants;
create policy "owner reads own restaurant" on restaurants
    for select using (owner_id = auth.uid());
create policy "owner updates own restaurant" on restaurants
    for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- 6) صلاحيات الأدمِن: قراءة/إدارة كل المطاعم والفروع (للوحة الأدمِن)
create policy "admin reads all restaurants" on restaurants
    for select using (is_platform_admin());
create policy "admin manages branches" on branches
    for all using (is_platform_admin()) with check (is_platform_admin());

-- 7) دفاع بالعمق: إبقاء دوال التوفير بعيدة عن دور anon
revoke execute on function admin_create_restaurant(text, text, text, text, text, text, text) from public, anon;
revoke execute on function claim_restaurant(text) from public, anon;
grant execute on function admin_create_restaurant(text, text, text, text, text, text, text) to authenticated;
grant execute on function claim_restaurant(text) to authenticated;
