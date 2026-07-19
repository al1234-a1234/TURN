-- ============================================================
--  إصلاح تكرار لا نهائي في سياسات RLS (خطأ 42P17)
--  السبب: سياسة "staff reads branch customers" على customers كانت
--  تستعلم reservations/waitlist، وسياساتهما تستعلم customers مجددًا.
--  الحل: نقل الفحص إلى دالة SECURITY DEFINER (مملوكة لـ postgres)
--  فتتجاوز استعلاماتها الداخلية RLS ويُكسَر التكرار.
-- ============================================================

create or replace function staff_can_read_customer(cust_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
    select exists (
        select 1 from public.reservations r
        where r.customer_id = cust_id
          and public.is_staff_of(public.restaurant_of_branch(r.branch_id))
    )
    or exists (
        select 1 from public.waitlist_entries w
        where w.customer_id = cust_id
          and public.is_staff_of(public.restaurant_of_branch(w.branch_id))
    );
$$;

drop policy if exists "staff reads branch customers" on customers;

create policy "staff reads branch customers" on customers
    for select using (staff_can_read_customer(id));
