-- تحكّم كامل بحالة الفرع لحظيًّا — يقدر عليه المالك أو الاستقبال من
-- /dashboard/reception مباشرة (بلا حاجة لصلاحية "الإعدادات"):
--   • إغلاق يدوي فوري (manually_closed) — يوقف الانضمام للطابور تمامًا.
--   • "مزدحم الآن" (busy_now) — مؤشّر فقط، لا يمنع الانضمام.
-- يُضاف فوقهما إنفاذ فعلي لأوقات الدوام (opening_hours) المخزَّنة أصلًا —
-- قبل هذا الترحيل كانت تُعرَض فقط بلا أي أثر على قبول الطابور.

alter table public.branch_settings
  add column if not exists manually_closed boolean not null default false,
  add column if not exists busy_now boolean not null default false;

-- هل الوقت الآن (بتوقيت الرياض) ضمن نطاق [open, close)؟ يدعم النطاق الليلي
-- (يفتح مساءً ويقفل بعد منتصف الليل، كـ close=02:00 < open=16:00). بلا ساعات
-- مضبوطة أو بقيمة تالفة = مفتوح دائمًا — لا نغلق فرعًا لم يضبط ساعاته أصلًا.
create or replace function public.branch_open_by_hours(p_hours jsonb, p_now timestamptz default now())
returns boolean language plpgsql stable
as $function$
declare
  v_open time; v_close time; v_now time;
begin
  if p_hours is null or coalesce(btrim(p_hours->>'open'), '') = '' or coalesce(btrim(p_hours->>'close'), '') = '' then
    return true;
  end if;
  v_open := (p_hours->>'open')::time;
  v_close := (p_hours->>'close')::time;
  v_now := (p_now at time zone 'Asia/Riyadh')::time;
  if v_open = v_close then return true; end if;
  return case when v_open < v_close
    then v_now >= v_open and v_now < v_close
    else v_now >= v_open or v_now < v_close
  end;
exception when others then
  return true;
end;
$function$;
grant execute on function public.branch_open_by_hours(jsonb, timestamptz) to authenticated, anon;

-- إنفاذ الإغلاق (اليدوي وحسب الدوام) عند أخذ دور جديد — كانت الحراسة السابقة
-- تفحص accepts_waitlist فقط (وضع الطابور مقابل الاستقبال المباشر)، وهذا
-- مفهوم مختلف تمامًا عن "الفرع مغلق فعليًّا الآن" فأضفنا حراسة مستقلة له.
create or replace function public.join_waitlist_guest(p_branch_id uuid, p_full_name text, p_phone text, p_party_size integer default 1, p_zone text default 'inside')
returns table(queue_pos integer, entry_id uuid)
language plpgsql security definer set search_path to ''
as $function$
declare
    v_name text := trim(p_full_name);
    v_phone text := trim(p_phone);
    v_party int := greatest(coalesce(p_party_size, 1), 1);
    v_zone text := case when p_zone in ('inside','outside') then p_zone else 'inside' end;
    v_branch_active boolean;
    v_accepts boolean;
    v_closed boolean;
    v_hours jsonb;
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

    select accepts_waitlist, manually_closed, opening_hours
      into v_accepts, v_closed, v_hours
      from public.branch_settings where branch_id = p_branch_id;
    if v_accepts is false then
        raise exception 'هذا الفرع لا يستقبل قائمة انتظار حاليًا' using errcode = 'P0001';
    end if;
    if v_closed is true or not public.branch_open_by_hours(v_hours) then
        raise exception 'الفرع مغلق حاليًا' using errcode = 'P0003';
    end if;

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

    -- حدّ المعدّل بعد فحص «دور قائم» كي لا يُحاسَب تحديث التذكرة
    if not public.check_rate('join:p:' || public.norm_phone_input(v_phone), 3, interval '10 minutes')
       or not public.check_rate('join:b:' || p_branch_id::text, 30, interval '1 minute') then
        raise exception 'محاولات كثيرة — انتظر دقائق ثم حاول' using errcode = 'P0429';
    end if;

    -- إنشاء/إيجاد العميل — الفهرس الفريد يمنع التشظّي والسباق يعود للصف القائم
    begin
        select id into v_cust_id from public.customers where phone = v_phone and user_id is null limit 1;
        if v_cust_id is null then
            insert into public.customers (full_name, phone) values (v_name, v_phone) returning id into v_cust_id;
        else
            update public.customers set full_name = v_name where id = v_cust_id;
        end if;
    exception when unique_violation then
        select id into v_cust_id from public.customers where phone = v_phone and user_id is null limit 1;
    end;

    -- إدخال الدور — نقرة مزدوجة متزامنة تعود للدور الذي سبق
    begin
        insert into public.waitlist_entries (branch_id, customer_id, party_size, zone)
             values (p_branch_id, v_cust_id, v_party, v_zone)
          returning waitlist_entries.position, id into v_pos, v_eid;
    exception when unique_violation then
        select w.position, w.id into v_pos, v_eid
          from public.waitlist_entries w
         where w.branch_id = p_branch_id and w.customer_id = v_cust_id
           and w.status in ('waiting','notified')
         limit 1;
    end;

    queue_pos := v_pos; entry_id := v_eid; return next;
end;
$function$;

-- تبديل تشغيلي سريع (إغلاق يدوي / مزدحم الآن) — لا يحتاج صلاحية "الإعدادات"
-- الكاملة (opening_hours/accepts_waitlist/max_party_size تبقى لمن يملكها)،
-- بل أي موظّف فعّال يصل فرعه (نفس تفويض صفحة الاستقبال). صلاحية "الطابور"
-- الدقيقة (waitlist) تُفرض في طبقة التطبيق (requirePerm) قبل هذا الاستدعاء،
-- تمامًا كإضافة عميل حاضر (walk-in) من نفس الصفحة.
create or replace function public.set_branch_status(p_branch_id uuid, p_manually_closed boolean, p_busy_now boolean)
returns boolean
language plpgsql security definer set search_path to ''
as $function$
begin
  if not (
    public.is_platform_admin()
    or (public.is_staff_of(public.restaurant_of_branch(p_branch_id))
        and public.can_access_branch(p_branch_id))
  ) then
    return false;
  end if;

  update public.branch_settings
     set manually_closed = p_manually_closed,
         busy_now = p_busy_now
   where branch_id = p_branch_id;

  return found;
end;
$function$;
grant execute on function public.set_branch_status(uuid, boolean, boolean) to authenticated;
