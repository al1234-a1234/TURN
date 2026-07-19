-- ============================================================
--  تحصين أمني: تثبيت search_path لدوال SECURITY DEFINER
--  (يعالج تحذير function_search_path_mutable من مدقّق Supabase)
--  مع تأهيل أسماء الجداول بالـ schema لأن search_path أصبح فارغًا.
-- ============================================================

create or replace function is_staff_of(rest_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
    select exists (
        select 1 from public.staff
        where staff.user_id = auth.uid()
          and staff.restaurant_id = rest_id
          and staff.is_active = true
    );
$$;

create or replace function is_manager_of(rest_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
    select exists (
        select 1 from public.staff
        where staff.user_id = auth.uid()
          and staff.restaurant_id = rest_id
          and staff.role in ('owner','manager')
          and staff.is_active = true
    );
$$;

create or replace function restaurant_of_branch(b_id uuid)
returns uuid
language sql
security definer
stable
set search_path = ''
as $$
    select restaurant_id from public.branches where id = b_id;
$$;

create or replace function set_reservation_time_range()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.time_range := tstzrange(
        new.reserved_at,
        new.reserved_at + make_interval(mins => new.duration_min)
    );
    return new;
end;
$$;

create or replace function touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;
