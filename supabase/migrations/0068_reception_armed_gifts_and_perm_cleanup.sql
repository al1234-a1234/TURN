-- 0068 — إصلاحان من الفحص الشامل.
--
-- ١) شارة «🎁» في الاستقبال كانت عمياء لمن بُنيت له: الصفحة تقرأ
--    customer_rewards مباشرة، وسياسة الجدول تشترط صلاحية customers،
--    وموظّف الاستقبال الافتراضي يملك waitlist فقط — فالشارة ترجع صفر
--    صفوف بصمت. تُقرأ الآن عبر دالة definer تشترط أن يكون المتصل
--    موظّفًا في المطعم وله وصول للفرع — نفس شرط رؤيته للطابور نفسه.
--
-- ٢) set_staff_permission كانت تقبل صلاحيتَي loyalty وmenu اللتين لم
--    يعد يقرؤهما أحد — قائمة الصلاحيات تطابق الواجهة الآن.

create or replace function public.reception_armed_gifts(p_branch_id uuid)
returns table (customer_id uuid, title text)
language sql
stable security definer
set search_path to ''
as $function$
  select cr.customer_id, cr.title
  from public.customer_rewards cr
  join public.branches b on b.id = p_branch_id
  where cr.restaurant_id = b.restaurant_id
    and cr.status = 'active'
    and cr.armed_at is not null
    and (cr.expires_at is null or cr.expires_at > now())
    and public.is_staff_of(b.restaurant_id)
    and public.can_access_branch(p_branch_id);
$function$;

revoke all on function public.reception_armed_gifts(uuid) from public, anon;
grant execute on function public.reception_armed_gifts(uuid) to authenticated;

create or replace function public.set_staff_permission(p_staff_id uuid, p_perm text, p_granted boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE rid uuid; bid uuid;
BEGIN
  SELECT restaurant_id, branch_id INTO rid, bid FROM public.staff WHERE id = p_staff_id;
  IF rid IS NULL THEN RETURN; END IF;
  IF NOT (public.is_manager_of(rid) OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  -- مربوط بفرع: لا يعدّل إلا موظّفي فرعه (وموظّف العلامة فوقه، لا تحته)
  IF public.caller_branch_id(rid) IS NOT NULL
     AND (bid IS NULL OR NOT public.can_access_branch(bid)) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_perm NOT IN ('waitlist','reservations','analytics','customers','reviews','settings','team') THEN
    RAISE EXCEPTION 'invalid permission';
  END IF;
  UPDATE public.staff
  SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(p_perm, p_granted)
  WHERE id = p_staff_id;
END;
$function$;

-- ═══ ٣) الهدايا بالرقم — لأن هوية الزبون في المنتج رقمه ═══
-- ‏my_rewards()‎ (0066) مربوطة بـ auth.uid()، لكن كل صفوف العملاء تُنشأ
-- من join_waitlist_guest بـ user_id فارغ — فلا هدية كانت ستظهر لأحد.
-- الزبون هنا ضيف برقمه، فالهدايا تُقرأ وتُسلَّح بالرقم، بنفس حارس
-- المعدّل الذي يحمي get_customer_rewards. التسليح ليس صرفًا: أسوأ ما
-- يفعله من يعرف رقم غيره أن يسلّح له هديته — والصرف بيد الموظّف وحده.

create or replace function public.rewards_by_phone(p_phone text)
returns table (
  id uuid, restaurant text, restaurant_slug text, kind text, title text,
  value numeric, value_kind text, description text, status text,
  armed_at timestamptz, expires_at timestamptz, redeemed_at timestamptz, created_at timestamptz
)
language plpgsql
stable security definer
set search_path to ''
as $function$
begin
  if length(public.norm_phone_input(p_phone)) <> 9 then return; end if;
  if not public.check_rate('rewards:p:' || public.norm_phone_input(p_phone), 60, interval '1 hour') then return; end if;
  return query
  select cr.id, r.name, r.slug, cr.kind, cr.title, cr.value, cr.value_kind,
         cr.description, cr.status, cr.armed_at, cr.expires_at, cr.redeemed_at, cr.created_at
  from public.customer_rewards cr
  join public.customers   c on c.id = cr.customer_id
  join public.restaurants r on r.id = cr.restaurant_id
  where right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 9) = public.norm_phone_input(p_phone)
    and cr.status in ('active','redeemed')
    and (cr.status = 'redeemed' or cr.expires_at is null or cr.expires_at > now())
  order by (cr.status = 'active') desc, cr.armed_at desc nulls last, cr.created_at desc;
end $function$;

create or replace function public.set_reward_armed_by_phone(p_reward_id uuid, p_phone text, p_arm boolean)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare n int;
begin
  if p_reward_id is null or length(public.norm_phone_input(p_phone)) <> 9 then return false; end if;
  if not public.check_rate('arm:p:' || public.norm_phone_input(p_phone), 30, interval '1 hour') then return false; end if;
  update public.customer_rewards cr
     set armed_at = case when p_arm then now() else null end
    from public.customers c
   where cr.id = p_reward_id
     and c.id = cr.customer_id
     and right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 9) = public.norm_phone_input(p_phone)
     and cr.status = 'active'
     and (cr.expires_at is null or cr.expires_at > now());
  get diagnostics n = row_count;
  return n > 0;
end $function$;

-- ═══ ٤) قنبلة موقوتة: retire_dormant_customers ما زالت تقرأ checkins ═══
-- كرون retention الليلي يناديها؛ 0067 أسقط الجدول ولم يعد كتابتها،
-- وplpgsql لا ينفجر إلا وقت التشغيل. الشرط المحذوف كان «لا تُقاعد من
-- سجّل مسحًا حديثًا» — والمسح نفسه حُذف، فالشرط بلا معنى.
create or replace function public.retire_dormant_customers(p_months int default 24)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare n int;
begin
  update public.customers c
     set full_name = null, email = null,
         phone = 'retired:' || substr(md5(coalesce(c.phone,'') || c.id::text), 1, 12)
   where c.user_id is null
     and coalesce(c.phone,'') not like 'retired:%'
     and not exists (select 1 from public.waitlist_entries w
                      where w.customer_id = c.id
                        and w.joined_at > now() - make_interval(months => p_months))
     and not exists (select 1 from public.reservations r
                      where r.customer_id = c.id
                        and r.created_at > now() - make_interval(months => p_months))
     and not exists (select 1 from public.customer_rewards cr
                      where cr.customer_id = c.id and cr.status = 'active')
     and c.created_at < now() - make_interval(months => p_months);
  get diagnostics n = row_count;
  return n;
end $function$;

-- ═══ ٥) تحصينات من التدقيق الأمني ═══

-- ‏check_rate كانت invoker — تعمل اليوم لأن rate_limits بلا سياسات،
-- وهذا حارس بالصدفة. definer + سحب من العموم = حارس بالقصد.
alter function public.check_rate(text, int, interval) security definer;
revoke execute on function public.check_rate(text, int, interval) from public, anon;

-- حذف اشتراك دفع باسم endpoint فقط — 0020 أغلقت هذا الباب و0042 فتحته
-- بدالة جديدة. تُسحب من المجهول؛ التنظيف يجري من جلسات مصادَقة.
revoke execute on function public.delete_dead_push_subscription(text) from public, anon;

-- بحث الكاشير والصرف كانا على مستوى العلامة كلها: مضيف فرع أ يقرأ هاتف
-- عميل فرع ب ويصرف هديته. يُحصران بعملاء فروع المتصل نفسها.
create or replace function public.staff_lookup_rewards(p_query text)
returns table (
  id uuid, customer_name text, customer_phone text, kind text, title text,
  value numeric, value_kind text, code text, expires_at timestamptz, created_at timestamptz
)
language sql
stable security definer
set search_path to ''
as $function$
  select cr.id, c.full_name, c.phone, cr.kind, cr.title, cr.value, cr.value_kind,
         cr.code, cr.expires_at, cr.created_at
  from public.customer_rewards cr
  join public.customers c on c.id = cr.customer_id
  where cr.status = 'active'
    and (cr.expires_at is null or cr.expires_at > now())
    and public.is_staff_of(cr.restaurant_id)
    and public.staff_can_read_customer(cr.customer_id)
    and (
      upper(coalesce(cr.code,'')) = upper(trim(p_query))
      or right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 9)
         = public.norm_phone_input(p_query)
    )
  order by cr.created_at desc
  limit 20;
$function$;

create or replace function public.staff_redeem_reward(p_reward_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare n int;
begin
  update public.customer_rewards cr
     set status = 'redeemed', redeemed_at = now(), armed_at = null
   where cr.id = p_reward_id
     and cr.status = 'active'
     and (cr.expires_at is null or cr.expires_at > now())
     and public.is_staff_of(cr.restaurant_id)
     and public.staff_can_read_customer(cr.customer_id);
  get diagnostics n = row_count;
  return n > 0;
end $function$;

-- ‏my_restaurant_status: تُرجع اسم صاحب أي رقم يُكتب، وبلا مستدعٍ واحد
-- في الواجهة — أداة تعداد هويات مجانية. تُحذف.
drop function if exists public.my_restaurant_status(text, text);

-- ═══ ٦) الانضمام: العدّاد قبل البحث، والاسم لا يُستبدل ═══
-- مسار «عندك دور حيّ، خذ تذكرتك» كان يرجع قبل عدّاد المعدّل — فحص مجاني
-- بلا حدّ يحوّل الرقم إلى معرّف تذكرة. العدّ أولًا فكل نداء له ثمن.
-- والاسم كان يُستبدل بلا إثبات ملكية: من يعرف رقمك يغيّر اسمك على شاشة
-- الاستقبال — صار يُكتب فقط إن كان فارغًا.

create or replace function public.join_waitlist_guest(
  p_branch_id uuid, p_full_name text, p_phone text,
  p_party_size integer default 1, p_zone text default 'inside'
)
returns table(queue_pos integer, entry_id uuid)
language plpgsql
security definer
set search_path to ''
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

    -- العدّاد أولًا: مسار «أعد تذكرتي» كان يرجع قبل الحساب، فصار فحص
    -- «هل لهذا الرقم دور حيّ؟» مجانيًّا بلا حدّ — أداة تعداد. الآن كل
    -- نداء له ثمن، والحدّ (٣/١٠د) يكفي المستخدم الحقيقي وإعادة تذكرته.
    if not public.check_rate('join:p:' || public.norm_phone_input(v_phone), 3, interval '10 minutes')
       or not public.check_rate('join:b:' || p_branch_id::text, 60, interval '1 minute') then
        raise exception 'محاولات كثيرة — انتظر دقائق ثم حاول' using errcode = 'P0429';
    end if;

    -- صفّ حيّ قائم لنفس الرقم؟ أعد تذكرته.
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
            -- الاسم لا يُستبدل بلا إثبات ملكية: من يعرف رقمك كان يغيّر
            -- اسمك على شاشة الاستقبال. يُكتب فقط إن كان فارغًا.
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
