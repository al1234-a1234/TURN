-- رفع سقف انضمام الفرع من 60 إلى 600 في الدقيقة.
--
-- السيناريو الذي كشف الخلل: ٥٠٠ شخص يمسحون الباركود لمطعمٍ واحد عند فتح الأبواب.
-- كان سقف 0065 (60/دقيقة) يمرّر أوّل ٦٠ ثم يرفض الرقم ٦١ فأكثر برسالة «محاولات
-- كثيرة» — أي رفض ٤٤٠ عميلًا حقيقيًّا في أسوأ لحظة ممكنة لأول انطباع.
--
-- لماذا 600 آمنة: الحدّ الحقيقي ضد إساءة الفرد هو سقف الرقم (3 لكل رقم/١٠د) وهو
-- باقٍ كما هو. سقف الفرع مجرّد حاجز ضد سكربت جامح يستعمل أرقامًا كثيرة؛ و600/دقيقة
-- (~١٠/ثانية) أعلى بكثير من أي اندفاع بشري لطابور مطعمٍ واحد، ويظلّ يحدّ السكربت،
-- وأيّ صفوف وهمية يراها الاستقبال ويمسحها. رفض عميلٍ حقيقي أسوأ بكثير من طوفانٍ
-- نادرٍ يُنظَّف يدويًّا.
--
-- الصحّة تحت التزامن (مؤكَّدة، بلا تغيير هنا): ترتيب الرقم يُحسب داخل
-- set_waitlist_position عبر pg_advisory_xact_lock(hashtext(branch_id)) الذي يُسلسِل
-- كل انضمامٍ متزامن لنفس الفرع قبل max(position)+1 — فلا رقمان متطابقان أبدًا،
-- والفروع المختلفة تتوازى (القفل لكل فرع). التكرار مستحيل منطقيًّا: لإعادة رقمٍ
-- يجب أن يكون صاحبه السابق قد غادر مجموعة الانتظار أصلًا. لا تغيير في البيانات —
-- إعادة تعريف دالةٍ فقط، والصلاحيات محفوظة عبر CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.join_waitlist_guest(p_branch_id uuid, p_full_name text, p_phone text, p_party_size integer DEFAULT 1, p_zone text DEFAULT 'inside'::text)
 RETURNS TABLE(queue_pos integer, entry_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

    -- سقف الرقم (3/10د) هو الحاجز ضد إساءة الفرد؛ سقف الفرع (600/دقيقة) حاجزٌ فضفاض
    -- ضد سكربت جامح فقط — يمرّر أي ازدحامٍ بشريّ حقيقي (حتى ٥٠٠ دفعةً واحدة).
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
