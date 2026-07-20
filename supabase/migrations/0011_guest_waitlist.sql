-- ============================================================
--  انضمام الضيف للطابور باسم + رقم فقط (بدون تسجيل حساب)
--
--  العميل يدخل، يختار المطعم، ويسجّل اسمه ورقمه فقط.
--  دالة SECURITY DEFINER تُنشئ/تُعيد استخدام ملف عميل ضيف
--  (user_id = null) ثم تُدرج طلب انتظار وتُعيد رقم الدور.
--  آمنة: تتحقّق أن الفرع نشط ويستقبل الانتظار، ولا تكشف بيانات.
-- ============================================================

create or replace function join_waitlist_guest(
    p_branch_id uuid,
    p_full_name text,
    p_phone text,
    p_party_size int default 1
)
returns int
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
begin
    if v_name = '' or v_phone = '' then
        raise exception 'الاسم والرقم مطلوبان' using errcode = '22023';
    end if;

    -- الفرع نشط؟
    select is_active into v_branch_active
      from public.branches where id = p_branch_id;
    if v_branch_active is distinct from true then
        raise exception 'الفرع غير متاح' using errcode = 'P0002';
    end if;

    -- يستقبل انتظار؟
    select accepts_waitlist into v_accepts
      from public.branch_settings where branch_id = p_branch_id;
    if v_accepts is false then
        raise exception 'هذا الفرع لا يستقبل قائمة انتظار حاليًا' using errcode = 'P0001';
    end if;

    -- إن كان لنفس الرقم دور نشط في هذا الفرع، أعِد رقمه (تفادي التكرار)
    select w.position into v_pos
      from public.waitlist_entries w
      join public.customers c on c.id = w.customer_id
     where w.branch_id = p_branch_id
       and c.phone = v_phone
       and w.status in ('waiting', 'notified')
     order by w.joined_at desc
     limit 1;
    if v_pos is not null then
        return v_pos;
    end if;

    -- إعادة استخدام ملف ضيف بنفس الرقم أو إنشاء جديد
    select id into v_cust_id
      from public.customers
     where phone = v_phone and user_id is null
     limit 1;

    if v_cust_id is null then
        insert into public.customers (full_name, phone)
             values (v_name, v_phone)
          returning id into v_cust_id;
    else
        update public.customers set full_name = v_name where id = v_cust_id;
    end if;

    insert into public.waitlist_entries (branch_id, customer_id, party_size, zone)
         values (p_branch_id, v_cust_id, v_party, 'any')
      returning position into v_pos;

    return v_pos;
end;
$$;

revoke execute on function join_waitlist_guest(uuid, text, text, int) from public;
grant execute on function join_waitlist_guest(uuid, text, text, int) to anon, authenticated;
