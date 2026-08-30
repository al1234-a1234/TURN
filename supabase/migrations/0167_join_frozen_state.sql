-- ============================================================================
--  حالةٌ ثالثة: «إيقاف الانضمام مؤقّتًا» (join_frozen) — منفصلةٌ تمامًا عن
--  queue_paused والسقف العدديّ.
--
--  ── العطل الذي وُلدت منه (تشغيل Pizza peel الأوّل، ٣٠ أغسطس) ──
--  امتلأ الطابور (٤٠/٤٠). لم يجد الاستقبال زرًّا يوقف الجديد وحده:
--   • queue_paused يقول للعميل «تفضّل مباشرةً» — كارثيّ و٣٧ ينتظرون.
--   • السقف العدديّ يعيد الفتح تلقائيًّا فور نزول العدد — فكلّ تجليسٍ يفتح
--     البابَ لجديد. فاضطرّوا لإيقاف التجليس ساعتين كي لا يتراكم الجدد.
--
--  ── الحالة الثالثة ──
--  join_frozen = true:
--   • يمنع كلّ انضمامٍ جديدٍ فورًا، بصرف النظر عن العدد صعودًا أو هبوطًا.
--   • لا يُلغى تلقائيًّا أبدًا — يدويًّا فقط (خلاف السقف).
--   • يعرض للعميل الجديد **نفس مسار السقف** (P0010) — لا رسالة جديدة.
--   • صفر أثرٍ على من في الطابور: فحصُ الإيقاف يقع **بعد** استعادة القائمين،
--     فمن انضمّ قبل التفعيل يبقى ويستعيد تذكرته.
--   • يسبق فحص queue_paused: فرعٌ مجمّدٌ ليس فرعًا يُدخِل مباشرةً — لا تناقض
--     في الرسائل.
--
--  ⚠️ يُختبر على turn-simulation أوّلًا (branch_settings مطابقٌ للإنتاج عمودًا،
--     وjoin_waitlist_guest يُستبدل هنا بنسخة الإنتاج + الإيقاف فتزول درفتُه).
-- ============================================================================

-- (١) العمود — الصفوف القائمة كلّها false، والفروع الجديدة كذلك بالافتراض.
alter table public.branch_settings
  add column if not exists join_frozen boolean not null default false;

-- (٢) المُبدِّل — مرآةٌ لـset_branch_queue_paused: نفس الحارس بالضبط
--     (أدمن المنصّة، أو موظّفٌ في مطعم الفرع وله حقّ الوصول إليه).
create or replace function public.set_branch_join_frozen(p_branch_id uuid, p_frozen boolean)
 returns boolean
 language plpgsql
 security definer
 set search_path to ''
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
     set join_frozen = coalesce(p_frozen, false),
         updated_at = now()
   where branch_id = p_branch_id;

  return found;
end;
$function$;

revoke all on function public.set_branch_join_frozen(uuid, boolean) from public;
grant execute on function public.set_branch_join_frozen(uuid, boolean) to authenticated, service_role;

-- (٣) join_waitlist_guest — نسخة الإنتاج حرفيًّا + سطرا الإيقاف وحدهما.
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
    v_frozen boolean;
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
           coalesce(max_party_size, 20), max_waitlist_size, coalesce(queue_paused, false),
           coalesce(join_frozen, false)
      into v_accepts, v_closed, v_hours, v_maxparty, v_maxwait, v_paused, v_frozen
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

    -- إيقاف الانضمام المؤقّت: يمنع كلّ جديدٍ فورًا بصرف النظر عن العدد، ولا
    -- يُلغى تلقائيًّا. يُعرض للعميل نفس مسار السقف (P0010) حرفيًّا. ويسبق فحص
    -- «بلا طابور» عمدًا: المجمّد ليس فرعًا يُدخِل مباشرةً، بل ممتلئٌ يدويًّا —
    -- فلا يرى عميلان رسالتين متناقضتين في اللحظة نفسها.
    if v_frozen then
        raise exception 'الطابور ممتلئ حاليًا' using errcode = 'P0010';
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

-- (٤) q20_schema_no_drift: دالّةٌ واحدةٌ أُضيفت (set_branch_join_frozen) — تحديث
--     البصمة عمدًا وموثّقًا (الخطّ الأحمر الخامس). مُتخطًّى على المحاكاة التي
--     لا تحمل الفحص أصلًا.
do $q20$
declare d text; d2 text;
begin
  if not exists (select 1 from pg_proc where proname='run_critical_checks' and pronamespace='public'::regnamespace) then
    raise notice 'run_critical_checks غير موجودة (محاكاة) — تخطّي تحديث البصمة';
    return;
  end if;
  select pg_get_functiondef(oid) into d
    from pg_proc where proname='run_critical_checks' and pronamespace='public'::regnamespace;
  d2 := replace(d, 'p.prokind=''f'') = 144', 'p.prokind=''f'') = 145');
  if d2 = d then
    raise exception 'لم أجد بصمة الدوالّ (١٤٤) في q20 — راجع يدويًّا قبل المتابعة.';
  end if;
  execute d2;
end
$q20$;

-- المتوقَّع بعد التطبيق (الإنتاج): ٢٠٤/٢٠٤ خضراء (العدّ ١٤٥ = ١٤٤ + المُبدِّل)،
-- والمفتاح الثالث في الاستقبال يمنع الجديد بـ«الطابور ممتلئ حاليًا» بلا لمس القائمين.
