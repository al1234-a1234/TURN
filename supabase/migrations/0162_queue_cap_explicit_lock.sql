-- ============================================================================
--  سقف الطابور يصمد اليوم — لكن بقفلٍ عارضٍ لا بتصميم. هذا الترحيل يجعله صريحًا.
--
--  ── ما قِيس فعليًّا (turn-simulation، بنسخة join_waitlist_guest مطابقة
--     للإنتاج بصمةً md5=2d259df16da866690d453bbf4e59573b) ──
--
--  الهجوم: سقف الفرع = ٥، الطابور فارغ، ثمّ ١٢ طلب انضمام **متزامنًا حقيقيًّا**
--  (١٢ اتصالًا منفصلًا، ١٢ pid مختلفًا، أُطلقت كلّها بقفلٍ استشاريّ كطلقة بداية).
--  النتيجة: ٥ دخلوا بالمواضع ١..٥ بالضبط، و٧ رُفضوا بـP0010. السقف لم يُخترق.
--
--  ولماذا صمد رغم أنّ الفحص `select count(*)` بلا أيّ قفل، يليه insert —
--  وهو نمط TOCTOU الكلاسيكيّ الذي يُفترض أن ينكسر؟ التوقيت كشف السبب:
--  أُطلقت ٤٠ محاولة معًا فبدأت كلّها في اللحظة نفسها، لكنّ أسرعها استغرق
--  ٣٠ms وأبطأها ٨١١ms بتدرّجٍ سُلّميّ منتظم — توقيع تسلسلٍ تامّ لا توازٍ.
--  والسبب: `check_rate('join:b:' || p_branch_id, 600, '1 minute')` تُنفَّذ قبل
--  فحص السقف، وهي insert…on conflict do update على **صفٍّ واحدٍ لكلّ فرع**.
--  فكلّ الطلبات على الفرع نفسه تصطفّ على قفل ذلك الصفّ، واحدًا تلو الآخر،
--  فلا يرى اثنان العدّاد نفسه أبدًا. أي أنّ صحّة السقف تتّكئ على أثرٍ جانبيّ
--  لمحدِّد المعدّل، لا على حارسٍ مقصود.
--
--  وهذا فخٌّ كامنٌ لا خللٌ قائم: يوم يُغيَّر check_rate — تخفيفًا للتنافس، أو
--  بتوزيع المفتاح على شظايا، أو باستبداله بعدّادٍ في الذاكرة — يسقط القفل
--  العارض بلا أن يمسّ أحدٌ سطرًا واحدًا في join_waitlist_guest، ويُخترق السقف
--  صامتًا. لا اختبار يمسك ذلك، ولا إنذار.
--
--  ── الإصلاح ──
--  قفلٌ استشاريّ صريح على مستوى الفرع (pg_advisory_xact_lock) قبل فحص السقف
--  مباشرةً، يُحرَّر تلقائيًّا بنهاية المعاملة. **لا يضيف أيّ تنافسٍ جديد**:
--  الطلبات على الفرع الواحد متسلسلة أصلًا عند هذه النقطة بفعل check_rate،
--  فالقفل يوثّق الضمان القائم ويثبّته بدل أن يتركه رهنَ الصدفة.
--  ولا يغيّر أيّ سلوكٍ ظاهر: نفس المدخلات تعطي نفس المخرجات والأخطاء.
--
--  ⚠️ غير مطبَّق — للمراجعة والتطبيق بعد انتهاء الخدمة الحيّة بإذنٍ صريح.
--  يُراجَع مستقلًّا عن 0161 (لا يعتمد أحدهما على الآخر).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.join_waitlist_guest(p_branch_id uuid, p_full_name text, p_phone text, p_party_size integer DEFAULT 1, p_zone text DEFAULT 'inside'::text)
 RETURNS TABLE(queue_pos integer, entry_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    v_paused boolean;
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

    select accepts_waitlist, manually_closed, opening_hours,
           coalesce(max_party_size, 20), max_waitlist_size, coalesce(queue_paused, false)
      into v_accepts, v_closed, v_hours, v_maxparty, v_maxwait, v_paused
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

    -- عميلٌ منضمٌّ أصلًا: نُعيد دوره القائم لا نرفضه — لا بسقفٍ امتلأ بعده،
    -- ولا بإيقافٍ وقع بعده. من هو في الطابور يبقى فيه ويستعيد تذكرته.
    select w.position, w.id into v_pos, v_eid
      from public.waitlist_entries w
      join public.customers c on c.id = w.customer_id
     where w.branch_id = p_branch_id and c.phone = v_phone
       and w.status in ('waiting', 'notified')
     order by w.joined_at desc limit 1;
    if v_eid is not null then
        queue_pos := v_pos; entry_id := v_eid; return next; return;
    end if;

    -- مفتوحٌ بلا طابور — للجدد وحدهم، بعد استعادة القائمين.
    if v_paused then
        raise exception 'لا يوجد انتظار الآن — تفضّل مباشرةً' using errcode = 'P0011';
    end if;

    -- السقف: عميلٌ جديد فقط يُقاس به — والعدّ حيٌّ لحظة الطلب لا كاش.
    --
    -- القفل الصريح: يمنع أن يقرأ طلبان العدّاد نفسه ثمّ يُدرجا معًا فيتجاوزا
    -- السقف. كان هذا مضمونًا عرَضًا عبر قفل صفّ check_rate('join:b:…') أعلاه؛
    -- صار الآن مضمونًا صراحةً فلا يسقط إن تغيّر محدِّد المعدّل يومًا.
    -- يُحرَّر تلقائيًّا بنهاية المعاملة، ولا يضيف تنافسًا جديدًا لأنّ الطلبات
    -- على الفرع الواحد متسلسلة أصلًا عند هذه النقطة.
    if v_maxwait is not null then
        perform pg_advisory_xact_lock(hashtext('waitlist_cap:' || p_branch_id::text));
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

-- المتوقَّع بعد التطبيق: نفس نتيجة اليوم بالضبط (٥ من ١٢ عند سقف ٥)، لكن
-- الضمان صار مستقلًّا عن سلوك check_rate بدل أن يكون معلّقًا عليه.
