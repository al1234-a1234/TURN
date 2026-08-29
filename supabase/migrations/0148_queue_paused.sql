-- ============================================================================
--  «مفتوح بلا طابور» — الفرع يعمل ويستقبل، ولا دورَ فيه.
--
--  ── المشكلة ──
--  المطعم فاضٍ تمامًا والفرع مفتوح، فيأخذ العميل دورًا رقمه ١ على مطعمٍ لا
--  طابور فيه أصلًا. فينتظر إشعارًا لا داعي له، أو يظنّ أنّ عليه انتظارًا
--  وهو يستطيع الدخول فورًا. **انتظارٌ وهميّ على مطعمٍ فارغ.**
--
--  ── لماذا عمودٌ جديد لا إعادةُ استعمال `accepts_waitlist` ──
--  لـ`accepts_waitlist` معنًى قائمٌ ومختلف: «استقبال مباشر — بلا حجز دور»،
--  وله عرضه الخاصّ في بطاقة الفرع. وخلط الحالتين في عمودٍ واحد يجعل
--  إطفاء الطابور مؤقّتًا لليلةٍ هادئة يبدو كإعلانٍ دائم أنّ المطعم لا يعمل
--  بالدور أصلًا — وهما قراران مختلفان تمامًا.
--
--  ── وكيف يختلف عن الإقفال ──
--                     مقفل      | بدون انتظار | مفتوح
--    يظهر للعملاء     «مغلق»    | **طبيعيًّا** | نعم
--    العدّاد           —         | «لا انتظار» | الرقم
--    زرّ أخذ الدور     مخفيّ      | **مخفيّ**    | ظاهر
--    الحجز المسبق     يبقى      | **يبقى**    | يبقى
--
--  ── قرارا المالك (٢٩ أغسطس) ──
--  ١) **لا يُفرَّغ الطابور القائم عند التفعيل.** من هو واقفٌ الآن يُجلَس؛
--     التفعيل يمنع الجدد فقط. وإلا صار زرًّا يشطب عملاء بصمت.
--  ٢) **يُطفأ فجرًا** مع `reset-manual-flags` كالإقفال اليدويّ — نسيانه
--     ليلةً يعني مطعمًا بلا طابور صباحًا وأحدٌ لا ينتبه.
--
--  ── ولماذا دالّةٌ منفصلة لا توسيعُ `set_branch_status` ──
--  توسيعها يغيّر توقيعها ⇒ `DROP`+`CREATE` ⇒ **تُصفَّر منحُها**. وقد وقع
--  ذلك فعلًا في هذا المشروع من قبل (`staff_branch_queue`، انظر رسالة
--  الالتزام f24cdf6). فدالّةٌ جديدة تتجنّب الفخّ كلّه.
-- ============================================================================

-- ── (١) العمود ──
alter table public.branch_settings
  add column if not exists queue_paused boolean not null default false;

comment on column public.branch_settings.queue_paused is
  'مفتوح بلا طابور: الفرع يُعرض ويُزار ويقبل الحجز، ولا يقبل أخذ دورٍ جديد. لا يشطب الطابور القائم.';

-- ── (٢) الحارس في القاعدة — وهو الحارس الحقيقيّ ──
-- إخفاء الزرّ وحده لا يكفي: نداءٌ مباشر يتخطّاه. فالرفض هنا.
-- ورمز P0011 جديد، وP0001/P0003 محجوزان لـ«لا يستقبل» و«مغلق».
create or replace function public.join_waitlist_guest(
  p_branch_id uuid, p_full_name text, p_phone text,
  p_party_size integer default 1, p_zone text default 'inside'::text
)
returns table(queue_pos integer, entry_id uuid)
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

    -- ── الجديد: مفتوحٌ بلا طابور ──
    -- بعد فحص الإغلاق عمدًا: من يصل هنا فالفرع مفتوحٌ فعلًا، والرسالة
    -- يجب أن تقول «ادخل مباشرةً» لا «مغلق».
    if v_paused then
        raise exception 'لا يوجد انتظار الآن — تفضّل مباشرةً' using errcode = 'P0011';
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

-- ملاحظة: `create or replace` بنفس التوقيع تمامًا ⇒ **المنح لا تُمسّ**.
-- ولا `grant` هنا عمدًا: أيّ منحٍ نكتبه قد يوسّع ما ضيّقه 0093.

-- ── (٣) مفتاح المالك/الاستقبال ──
-- دالّةٌ منفصلة لا توسيعٌ لـset_branch_status — تفاديًا لتصفير المنح.
-- والحراسة نفسها حرفيًّا: مدير منصّة، أو موظّفٌ في المطعم يملك الفرع.
create or replace function public.set_branch_queue_paused(
  p_branch_id uuid,
  p_paused boolean
)
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
     set queue_paused = coalesce(p_paused, false),
         updated_at = now()
   where branch_id = p_branch_id;

  return found;
end;
$function$;

revoke all on function public.set_branch_queue_paused(uuid, boolean) from public;
revoke all on function public.set_branch_queue_paused(uuid, boolean) from anon;
grant execute on function public.set_branch_queue_paused(uuid, boolean) to authenticated;

-- ── (٤) حارس النسيان: يُطفأ فجرًا مع الإقفال اليدويّ ──
select cron.unschedule('reset-manual-flags')
 where exists (select 1 from cron.job where jobname='reset-manual-flags');

select cron.schedule('reset-manual-flags', '0 1 * * *', $cron$
  update public.branch_settings
     set manually_closed = false, busy_now = false, queue_paused = false
   where manually_closed or busy_now or queue_paused
$cron$);

-- ── (٥) الفحوص تلحق في الترحيل نفسه (تعهّد 0144) ──
-- دالّة واحدة جديدة ⇒ ١٤٣ ← ١٤٤ إن كان 0146 و0147 مطبَّقَين.
-- ⚠️ لم يُطبَّقا بعد، فالعدد الحقيقيّ وقت كتابة هذا الملفّ ١٣٩ ← ١٤٠.
--    الكتلة أدناه تتعامل مع الحالتين ولا تفترض أيّهما.
do $mig$
declare v_def text; v_now int; v_old text; v_new text;
begin
  select count(*)::int into v_now
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.prokind='f';

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='run_critical_checks';
  if v_def is null then raise exception 'run_critical_checks غير موجودة'; end if;

  if position('w26_queue_paused_col' in v_def) = 0 then
    v_def := replace(v_def, E'    (\'q20_schema_no_drift\',',
      E'    (\'w26_queue_paused_col\',      exists(select 1 from information_schema.columns\n'
   || E'                                    where table_schema=\'public\' and table_name=\'branch_settings\'\n'
   || E'                                      and column_name=\'queue_paused\')),\n'
   || E'    (\'w26_join_honors_pause\',     (select pg_get_functiondef(oid) like \'%P0011%\'\n'
   || E'                                    from pg_proc where proname=\'join_waitlist_guest\' and pronargs=5)),\n'
   || E'    (\'w26_pause_rpc_locked\',      (not has_function_privilege(\'anon\',\'public.set_branch_queue_paused(uuid,boolean)\',\'EXECUTE\')\n'
   || E'                                   and has_function_privilege(\'authenticated\',\'public.set_branch_queue_paused(uuid,boolean)\',\'EXECUTE\'))),\n'
   || E'    (\'w26_pause_resets_at_dawn\',  (select command like \'%queue_paused%\'\n'
   || E'                                    from cron.job where jobname=\'reset-manual-flags\')),\n'
   || E'    (\'q20_schema_no_drift\',');
  end if;

  -- المرجع القديم هو العدد قبل هذا الترحيل (v_now يشمل الدالّة الجديدة أصلًا)
  v_old := 'prokind=''f'') = ' || (v_now - 1)::text;
  v_new := 'prokind=''f'') = ' || v_now::text;
  if position(v_old in v_def) = 0 then
    raise exception 'المرجع المتوقَّع (%) غير موجود في الشبكة — راجع يدويًّا', v_old;
  end if;
  v_def := replace(v_def, v_old, v_new);

  execute v_def;
end
$mig$;

-- ============================================================================
--  تحقّقٌ بعد التطبيق:
--
--    -- ١) الانضمام ما زال يعمل حين لا إيقاف (على فرع المراقبة):
--    select * from public.join_waitlist_guest('<canary branch>','اختبار','0500000000',2,'inside');
--
--    -- ٢) والإيقاف يمنعه فعلًا:
--    update branch_settings set queue_paused = true where branch_id = '<canary>';
--    select * from public.join_waitlist_guest('<canary branch>','اختبار٢','0500000001',2,'inside');
--    -- المتوقَّع: P0011 «لا يوجد انتظار الآن — تفضّل مباشرةً»
--
--    -- ٣) والطابور القائم لم يُمسّ (قرار المالك):
--    select count(*) from waitlist_entries
--     where branch_id='<canary>' and status in ('waiting','notified');
--
--    -- ٤) والشبكة كاملة:
--    select count(*) filter (where not pass), count(*) from public.run_critical_checks();
-- ============================================================================
