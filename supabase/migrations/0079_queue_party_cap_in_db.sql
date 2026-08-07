-- ============================================================================
--  سقف عدد الأشخاص: سقف المالك لا رقمٌ مكتوبٌ في الدالّة
--
--  `join_waitlist_guest` كانت تقصّ العدد عند ٥٠ — رقمٌ ثابتٌ لا علاقة له
--  بالمطعم. وسقف المالك (max_party_size) كان يُطبَّق في التطبيق وحده، أي أن
--  نداءً مباشرًا بمفتاح anon يتجاوزه: مطعمٌ سقفه أربعة يستقبل صفًّا بخمسين.
--
--  والحجز يقصّ في القاعدة منذ 0077، فبقي الطابور وحده خارج الحارس. الأمران
--  الآن سواء: السقف حيث لا يُلتَفّ عليه.
--
--  ملاحظة: `staff_add_walkin` تبقى بلا سقف عمدًا — السقف يحدّ ما يطلبه العميل
--  إلكترونيًّا، لا ما يُدخله المضيف وهو يرى الناس أمامه ويضمّ طاولتين.
-- ============================================================================

create or replace function public.join_waitlist_guest(
  p_branch_id uuid,
  p_full_name text,
  p_phone     text,
  p_party_size integer default 1,
  p_zone      text default 'inside'
) returns table(queue_pos integer, entry_id uuid)
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_name  text := left(trim(p_full_name), 120);
    v_phone text := trim(p_phone);
    -- يُحسب بعد قراءة الإعدادات: السقف يخصّ الفرع لا الدالّة
    v_party int;
    v_maxparty int;
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

    select accepts_waitlist, manually_closed, opening_hours, coalesce(max_party_size, 20)
      into v_accepts, v_closed, v_hours, v_maxparty
      from public.branch_settings where branch_id = p_branch_id;
    if v_accepts is false then
        raise exception 'هذا الفرع لا يستقبل قائمة انتظار حاليًا' using errcode = 'P0001';
    end if;
    if v_closed is true or not public.branch_open_by_hours(v_hours) then
        raise exception 'الفرع مغلق حاليًا' using errcode = 'P0003';
    end if;

    -- يُقصّ ولا يُرفض: من اختار خمسةً وسقف الفرع أربعة يدخل بأربعة، ولا يُردّ
    -- من الباب برسالة خطأ. نفس مبدأ الحجز.
    v_party := least(greatest(coalesce(p_party_size, 1), 1), greatest(coalesce(v_maxparty, 20), 1));

    if not public.check_rate('join:p:' || public.norm_phone_input(v_phone), 3, interval '10 minutes')
       or not public.check_rate('join:b:' || p_branch_id::text, 600, interval '1 minute') then
        raise exception 'محاولات كثيرة — انتظر دقائق ثم حاول' using errcode = 'P0429';
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
           and w.status in ('waiting','notified')
         limit 1;
    end;

    queue_pos := v_pos; entry_id := v_eid; return next;
end;
$function$;

-- الدالّة القديمة للحجز ماتت: 0077 استبدلتها بـ book_reservation_guest، ولم
-- يبقَ لها مستدعٍ في التطبيق. تُترك دالّةً غير مستعمَلة تُغري من يعود إليها
-- لاحقًا فيُنشئ حجوزًا بلا طاولة — وهي العلّة نفسها التي أصلحناها.
drop function if exists public.create_reservation_guest(uuid, text, text, timestamptz, integer, text);
