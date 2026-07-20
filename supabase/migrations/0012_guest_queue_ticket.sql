-- ============================================================
--  تذكرة الطابور للضيف: إرجاع معرّف الطلب + إلغاء الدور
--  - join_waitlist_guest تُرجع (position, entry_id) بدل رقم فقط
--  - cancel_waitlist_guest يلغي دور الضيف بالتحقّق من الرقم
-- ============================================================

drop function if exists join_waitlist_guest(uuid, text, text, int);

create function join_waitlist_guest(
    p_branch_id uuid,
    p_full_name text,
    p_phone text,
    p_party_size int default 1
)
returns table (queue_pos int, entry_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_name text := trim(p_full_name);
    v_phone text := trim(p_phone);
    v_party int := greatest(coalesce(p_party_size, 1), 1);
    v_branch_active boolean;
    v_accepts boolean;
    v_cust_id uuid;
    v_pos int;
    v_eid uuid;
begin
    if v_name = '' or v_phone = '' then
        raise exception 'الاسم والرقم مطلوبان' using errcode = '22023';
    end if;

    select is_active into v_branch_active from public.branches where id = p_branch_id;
    if v_branch_active is distinct from true then
        raise exception 'الفرع غير متاح' using errcode = 'P0002';
    end if;

    select accepts_waitlist into v_accepts from public.branch_settings where branch_id = p_branch_id;
    if v_accepts is false then
        raise exception 'هذا الفرع لا يستقبل قائمة انتظار حاليًا' using errcode = 'P0001';
    end if;

    -- دور نشط بنفس الرقم؟ أعِده
    select w.position, w.id into v_pos, v_eid
      from public.waitlist_entries w
      join public.customers c on c.id = w.customer_id
     where w.branch_id = p_branch_id
       and c.phone = v_phone
       and w.status in ('waiting', 'notified')
     order by w.joined_at desc
     limit 1;
    if v_eid is not null then
        queue_pos := v_pos; entry_id := v_eid; return next; return;
    end if;

    select id into v_cust_id from public.customers where phone = v_phone and user_id is null limit 1;
    if v_cust_id is null then
        insert into public.customers (full_name, phone) values (v_name, v_phone) returning id into v_cust_id;
    else
        update public.customers set full_name = v_name where id = v_cust_id;
    end if;

    insert into public.waitlist_entries (branch_id, customer_id, party_size, zone)
         values (p_branch_id, v_cust_id, v_party, 'any')
      returning waitlist_entries.position, id into v_pos, v_eid;

    queue_pos := v_pos; entry_id := v_eid; return next;
end;
$$;

revoke execute on function join_waitlist_guest(uuid, text, text, int) from public;
grant execute on function join_waitlist_guest(uuid, text, text, int) to anon, authenticated;

-- إلغاء الدور: يتحقّق أن الرقم يطابق صاحب الطلب
create or replace function cancel_waitlist_guest(p_entry_id uuid, p_phone text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_phone text := trim(p_phone);
    v_ok boolean := false;
begin
    update public.waitlist_entries w
       set status = 'cancelled', updated_at = now()
      from public.customers c
     where w.id = p_entry_id
       and c.id = w.customer_id
       and c.phone = v_phone
       and w.status in ('waiting', 'notified');
    get diagnostics v_ok = row_count;
    return v_ok;
end;
$$;

revoke execute on function cancel_waitlist_guest(uuid, text) from public;
grant execute on function cancel_waitlist_guest(uuid, text) to anon, authenticated;
