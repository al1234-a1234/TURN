-- ============================================================
--  تدفّق إنشاء مطعم + فرع للمالك الجديد (بدون SQL يدوي)
--
--  المشكلة: إضافة فرع تتطلب is_manager_of (وجود صف في staff)،
--  لكن المالك الجديد ليس في staff بعد. الحل: دالة SECURITY DEFINER
--  ذرّية تُنشئ المطعم + تسجّل المالك في staff + الفرع معًا.
-- ============================================================

-- إنشاء إعدادات افتراضية تلقائيًا لأي فرع جديد
create or replace function create_default_branch_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.branch_settings (branch_id)
    values (new.id)
    on conflict (branch_id) do nothing;
    return new;
end;
$$;

create trigger t_branch_default_settings
    after insert on branches
    for each row execute function create_default_branch_settings();

-- إنشاء مطعم + فرع للمالك الحالي (auth.uid) بشكل ذرّي
create or replace function create_restaurant_with_branch(
    p_name text,
    p_slug text,
    p_branch_name text,
    p_name_en text default null,
    p_phone text default null,
    p_city text default null,
    p_address text default null,
    p_timezone text default 'Asia/Riyadh'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_uid uuid := auth.uid();
    v_rest_id uuid;
begin
    if v_uid is null then
        raise exception 'يجب تسجيل الدخول' using errcode = '28000';
    end if;

    insert into public.restaurants (owner_id, name, name_en, slug, phone)
        values (v_uid, p_name, p_name_en, p_slug, p_phone)
        returning id into v_rest_id;

    insert into public.staff (user_id, restaurant_id, role)
        values (v_uid, v_rest_id, 'owner')
        on conflict (user_id, restaurant_id) do nothing;

    insert into public.branches (restaurant_id, name, city, address, timezone)
        values (v_rest_id, p_branch_name, p_city, p_address, p_timezone);

    return p_slug;
end;
$$;

grant execute on function create_restaurant_with_branch(
    text, text, text, text, text, text, text, text
) to authenticated;
