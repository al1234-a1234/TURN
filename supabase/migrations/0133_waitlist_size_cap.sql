-- ============================================================================
--  سقف حجم الطابور — طلب مباشر: «لو حطيت مثلًا ٢٠، ووصلوا عشرين، يظهر
--  للعميل أن الانتظار وصل ٢٠ ومتوقف إلى أن يتاح مكان أو يجلسون أشخاص».
--
--  اختياريّ بالكامل (NULL = بلا سقف، السلوك الحالي كما هو لكل فرعٍ لم يضبطه
--  مالكه). العدّ على الفرع كاملًا لا القسم — طلب المشغّل رقمًا واحدًا بسيطًا
--  («٢٠»)، لا سقفًا منفصلًا لكل قسم.
-- ============================================================================

alter table public.branch_settings
  add column if not exists max_waitlist_size int null;

alter table public.branch_settings
  add constraint branch_settings_max_waitlist_size_range
  check (max_waitlist_size is null or max_waitlist_size > 0);

create or replace function public.join_waitlist_guest(
  p_branch_id uuid, p_full_name text, p_phone text,
  p_party_size int default 1, p_zone text default 'inside'
)
returns table(queue_pos int, entry_id uuid)
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_name  text := left(trim(p_full_name), 120);
    v_phone text := trim(p_phone);
    v_norm  text;
    v_party int;
    v_maxparty int;
    v_maxwait int;
    v_live_count int;
    v_zone text := nullif(btrim(p_zone), '');
    v_branch_active boolean;
    v_accepts boolean; v_closed boolean; v_hours jsonb;
    v_cust_id uuid; v_pos int; v_eid uuid;
begin
    if v_name = '' or v_phone = '' then
        raise exception 'الاسم والرقم مطلوبان' using errcode = '22023';
    end if;

    v_norm := public.norm_phone_input(v_phone);
    if v_norm ~ '^5[0-9]{8}$' then
        v_phone := '0' || v_norm;
    end if;

    select is_active into v_branch_active from public.branches where id = p_branch_id;
    if v_branch_active is distinct from true then
        raise exception 'الفرع غير متاح' using errcode = 'P0002';
    end if;

    select accepts_waitlist, manually_closed, opening_hours, coalesce(max_party_size, 20), max_waitlist_size
      into v_accepts, v_closed, v_hours, v_maxparty, v_maxwait
      from public.branch_settings where branch_id = p_branch_id;
    if v_accepts is false then
        raise exception 'هذا الفرع لا يستقبل قائمة انتظار حاليًا' using errcode = 'P0001';
    end if;
    if v_closed is true or not public.branch_open_by_hours(v_hours) then
        raise exception 'الفرع مغلق حاليًا' using errcode = 'P0003';
    end if;

    v_party := least(greatest(coalesce(p_party_size, 1), 1), greatest(coalesce(v_maxparty, 20), 1));

    if not public.check_rate('join:p:' || public.norm_phone_input(v_phone), 3, interval '10 minutes')
       or not public.check_rate('join:b:' || p_branch_id::text, 600, interval '1 minute') then
        raise exception 'محاولات كثيرة — انتظر دقائق ثم حاول' using errcode = 'P0429';
    end if;

    -- عميلٌ منضمٌّ أصلًا: نُعيد دوره القائم لا نرفضه بسقفٍ امتلأ بعده
    select w.position, w.id into v_pos, v_eid
      from public.waitlist_entries w
      join public.customers c on c.id = w.customer_id
     where w.branch_id = p_branch_id and c.phone = v_phone
       and w.status in ('waiting', 'notified')
     order by w.joined_at desc limit 1;
    if v_eid is not null then
        queue_pos := v_pos; entry_id := v_eid; return next; return;
    end if;

    -- السقف: عميلٌ جديد فقط يُقاس به — والعدّ حيٌّ لحظة الطلب لا كاش
    if v_maxwait is not null then
        select count(*) into v_live_count
          from public.waitlist_entries
         where branch_id = p_branch_id and status in ('waiting', 'notified');
        if v_live_count >= v_maxwait then
            raise exception 'الطابور ممتلئ حاليًا' using errcode = 'P0010';
        end if;
    end if;

    begin
        select id into v_cust_id from public.customers where phone = v_phone and user_id is null limit 1;
        if v_cust_id is null then
            insert into public.customers (full_name, phone) values (v_name, v_phone) returning id into v_cust_id;
        else
            update public.customers set full_name = v_name
             where id = v_cust_id and coalesce(btrim(full_name),'') = '';
        end if;
    exception when unique_violation then
        select id into v_cust_id from public.customers where phone = v_phone and user_id is null limit 1;
    end;

    begin
        insert into public.waitlist_entries (branch_id, customer_id, party_size, zone)
             values (p_branch_id, v_cust_id, v_party, v_zone)
          returning waitlist_entries.position, id into v_pos, v_eid;
    exception when unique_violation then
        select w.position, w.id into v_pos, v_eid
          from public.waitlist_entries w
         where w.branch_id = p_branch_id and w.customer_id = v_cust_id
           and w.status in ('waiting','notified') limit 1;
    end;

    queue_pos := v_pos; entry_id := v_eid; return next;
end;
$function$;
