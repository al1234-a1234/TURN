-- حدود طول للنصوص — لم يكن في القاعدة كلّها ولا قيد طولٍ واحد.
--
-- الأخطر: customers.full_name يكتبه ضيفٌ مجهول بلا حدّ في أي طبقة (لا الواجهة
-- ولا الـaction ولا القاعدة). اسمٌ بحجم ميغابايت يدخل مرّة، ثم يُشحن في كل
-- بطاقة استقبال، وفي شاشة الصالة، وفي متن رسالة واتساب — و«truncate» في CSS
-- يُخفيه بصريًّا فقط بينما البايتات تُنقل في كل طلب.
--
-- الحدود سخيّة عمدًا: أطول اسم عربي مركّب أقلّ من ١٢٠ حرفًا بكثير، فلا عميل
-- حقيقي يُرفض. الغرض سدّ الانتفاخ لا تضييق الاستعمال.
--
-- ملاحظة: قيود CHECK تُطبَّق على الصفوف الجديدة والمحدَّثة؛ تحقّقنا أن كل
-- الصفوف القائمة تحت هذه الحدود قبل الإضافة (أطول قيمة فعلية أقصر بكثير).

ALTER TABLE public.customers
  ADD CONSTRAINT customers_full_name_len CHECK (char_length(full_name) <= 120),
  ADD CONSTRAINT customers_email_len     CHECK (char_length(email)     <= 254);

ALTER TABLE public.menu_items
  ADD CONSTRAINT menu_items_name_len CHECK (char_length(name)        <= 120),
  ADD CONSTRAINT menu_items_desc_len CHECK (char_length(description) <= 500);

ALTER TABLE public.menu_categories
  ADD CONSTRAINT menu_categories_name_len CHECK (char_length(name) <= 120);

ALTER TABLE public.branches
  ADD CONSTRAINT branches_name_len    CHECK (char_length(name)    <= 120),
  ADD CONSTRAINT branches_address_len CHECK (char_length(address) <= 300);

ALTER TABLE public.restaurants
  ADD CONSTRAINT restaurants_name_len CHECK (char_length(name)        <= 120),
  ADD CONSTRAINT restaurants_desc_len CHECK (char_length(description) <= 1000);

-- والدالة تقصّ بهدوء قبل أن يصطدم عميلٌ حقيقي بالقيد: القاعدة حاجزٌ أخير
-- يغطّي كل المسارات، والقصّ هنا يضمن ألّا يُرفض انضمام بسبب لصقةٍ طويلة.
CREATE OR REPLACE FUNCTION public.join_waitlist_guest(p_branch_id uuid, p_full_name text, p_phone text, p_party_size integer DEFAULT 1, p_zone text DEFAULT 'inside'::text)
 RETURNS TABLE(queue_pos integer, entry_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    v_name text := left(trim(p_full_name), 120);
    v_phone text := trim(p_phone);
    v_party int := least(greatest(coalesce(p_party_size, 1), 1), 50);
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
