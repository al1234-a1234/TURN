-- ============================================================
--  تحويل المنتج إلى "قائمة انتظار" (walk-in) وحذف الاشتراكات
--  - إضافة المنطقة (داخل/خارج/أي مكان) لطلب الانتظار
--  - ترتيب تلقائي في الطابور (position)
--  - دالة عدّادات عامة (إجمالي/داخل/خارج) دون كشف بيانات الأفراد
--  - حذف جدول الاشتراكات (المنتج صار انتظار فقط)
-- ============================================================

-- 1) منطقة الجلوس المطلوبة في طلب الانتظار
alter table waitlist_entries
    add column zone text not null default 'any'
    check (zone in ('any', 'inside', 'outside'));

-- 2) ترتيب تلقائي في طابور الفرع النشط
create or replace function set_waitlist_position()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.position is null then
        select coalesce(max(w.position), 0) + 1
          into new.position
          from public.waitlist_entries w
         where w.branch_id = new.branch_id
           and w.status in ('waiting', 'notified');
    end if;
    return new;
end;
$$;

create trigger t_waitlist_position
    before insert on waitlist_entries
    for each row execute function set_waitlist_position();

-- 3) عدّادات الطابور العامة (تتجاوز RLS، تُرجع أرقامًا فقط)
create or replace function waitlist_counts(b_id uuid)
returns table (total int, inside int, outside int)
language sql
security definer
stable
set search_path = ''
as $$
    select
        count(*)::int,
        count(*) filter (where zone = 'inside')::int,
        count(*) filter (where zone = 'outside')::int
    from public.waitlist_entries
    where branch_id = b_id
      and status in ('waiting', 'notified');
$$;

grant execute on function waitlist_counts(uuid) to anon, authenticated;

-- 4) حذف الاشتراكات — المنتج أصبح قائمة انتظار فقط
drop table if exists subscriptions cascade;
drop type if exists subscription_status;
