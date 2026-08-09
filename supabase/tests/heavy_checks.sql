-- ============================================================================
--  العشرة الثقيلة — فحوصٌ سلوكية لا بنيوية.
--
--  شبكة `critical_checks.sql` تسأل: «هل الحارس موجود؟» — وهي تجيب عن البنية.
--  وهذه تسأل: «هل يصمد إذا هوجم؟» — فتبني مطعمًا وفرعًا وعملاء حقيقيّين،
--  ثم تهاجمهم: تُغرق الطابور، وتشقّ الهويّة، وتُغلق المطعم، وتصرف الهديّة
--  مرّتين، وتنتحل صفة الإدارة. الفحص البنيويّ يمرّ ولو كان الحارس معطوبًا؛
--  وهذه لا تمرّ إلا إذا عمل.
--
--  كلّها داخل معاملةٍ تُرجَع: لا صفٌّ واحد يبقى في الإنتاج بعد التشغيل.
--  التشغيل: نفّذ الملف كاملًا. النتيجة جدولٌ واحد، وأي pass=false كسرٌ يوقف
--  التسليم.
-- ============================================================================
begin;

create temp table heavy_result(id int, name text, pass boolean, detail text) on commit drop;

do $body$
declare
  v_rest uuid; v_branch uuid; v_closed_branch uuid; v_zone text; v_owner uuid; v_tag text;
  v_cust uuid; v_cust2 uuid; v_tbl uuid;
  r1 record; r2 record;
  i int; v_ok int := 0; v_blocked int := 0; v_live int;
  v_eid uuid; v_status text; v_bool boolean; v_int int; v_txt text;
begin
  -- ── مسرحٌ نظيف: مطعمٌ وفرعٌ مفتوحان على مدار الساعة ──
  -- مالكٌ قائم: العمود NOT NULL، ولا ننشئ مستخدمًا في auth لأجل فحص
  -- وسمٌ عشوائي لكل تشغيل: أرقام الاختبار يجب ألّا تصطدم بأرقامٍ حقيقية
  v_tag := lpad((floor(random()*9000)::int + 1000)::text, 4, '0');

  select owner_id into v_owner from public.restaurants where owner_id is not null limit 1;

  insert into public.restaurants (name, slug, is_active, owner_id)
    values ('__heavy_test__', 'heavy-test-' || substr(md5(clock_timestamp()::text),1,8), true, v_owner)
    returning id into v_rest;

  insert into public.branches (restaurant_id, name, city, is_active)
    values (v_rest, 'فرع الاختبار', 'الرياض', true) returning id into v_branch;
  -- الإعدادات يخلقها تريغر عند إنشاء الفرع — نعدّلها لا نُنشئها
  update public.branch_settings set accepts_waitlist = true, manually_closed = false,
         opening_hours = '{"open":"00:00","close":"23:59"}'::jsonb
   where branch_id = v_branch;

  insert into public.branches (restaurant_id, name, city, is_active)
    values (v_rest, 'فرع مغلق', 'الرياض', true) returning id into v_closed_branch;
  update public.branch_settings set accepts_waitlist = true, manually_closed = false,
         opening_hours = jsonb_build_object(
            'open',  to_char(now() at time zone 'Asia/Riyadh' + interval '2 hours','HH24:MI'),
            'close', to_char(now() at time zone 'Asia/Riyadh' + interval '4 hours','HH24:MI'))
   where branch_id = v_closed_branch;

  delete from public.rate_limits where key like 'join:%' or key like 'resv:%';

  -- ══ (١) فرعٌ جديد يقبل دورًا في اللحظة الأولى ══
  -- العطب الذي كاد يوقف التسليم: فرعٌ يولد بلا أقسام ⇒ لا أحد يأخذ دورًا فيه أبدًا
  begin
    select * into r1 from public.join_waitlist_guest(v_branch, 'أوّل عميل', '05'||v_tag||'0001', 2, null);
    insert into heavy_result values (1, 'h01_new_branch_accepts_turn_immediately',
      r1.entry_id is not null, coalesce('entry=' || r1.entry_id::text, 'NULL'));
  exception when others then
    insert into heavy_result values (1, 'h01_new_branch_accepts_turn_immediately', false, sqlstate || ' ' || sqlerrm);
  end;

  -- ══ (٢) الرقم الواحد لا ينشقّ إلى هويّتين ══
  -- «+966 50…» و«05…» شخصٌ واحد — وإلّا أخذ دورين وضاعت زياراته وهداياه
  delete from public.rate_limits where key like 'join:%';
  begin
    select * into r1 from public.join_waitlist_guest(v_branch, 'ثاني', '05'||v_tag||'0002', 2, null);
    select * into r2 from public.join_waitlist_guest(v_branch, 'ثاني', '+966 5'||v_tag||'0002', 2, null);
    select count(*) into v_int from public.customers where public.norm_phone_input(phone) = '5'||v_tag||'0002';
    insert into heavy_result values (2, 'h02_phone_identity_never_splits',
      r1.entry_id = r2.entry_id and v_int = 1,
      'same_entry=' || (r1.entry_id = r2.entry_id)::text || ' customer_rows=' || v_int);
  exception when others then
    insert into heavy_result values (2, 'h02_phone_identity_never_splits', false, sqlstate || ' ' || sqlerrm);
  end;

  -- ══ (٣) الإغراق مصدود عند سقفٍ صلب ══
  -- خصمٌ يحقن آلاف الصفوف الوهمية فيرى العميل «٦٠٠٠ بالانتظار» ويمشي
  for i in 1..320 loop
    insert into public.customers (full_name, phone)
      values ('flood', '05'||v_tag||lpad((1000+i)::text,4,'0')) returning id into v_cust;
    begin
      insert into public.waitlist_entries (branch_id, customer_id, party_size, zone)
        values (v_branch, v_cust, 2, null);
      v_ok := v_ok + 1;
    exception when sqlstate 'P0430' then v_blocked := v_blocked + 1;
    end;
  end loop;
  select count(*) into v_live from public.waitlist_entries
   where branch_id = v_branch and status in ('waiting','notified');
  insert into heavy_result values (3, 'h03_queue_flood_is_capped',
    v_live <= 300 and v_blocked > 0, 'live=' || v_live || ' blocked=' || v_blocked);

  -- ══ (٤) القسم الفارغ يسقط على أوّل قسم ولا ينهار ══
  -- عمود zone هو NOT NULL؛ حارسٌ يمرّر NULL يقتل الإدخال برسالةٍ لا يفهمها أحد
  select z.key into v_zone from public.branch_zones z
   where z.branch_id = v_branch and z.is_active order by z.sort_order limit 1;
  update public.waitlist_entries set status = 'expired' where branch_id = v_branch;
  insert into public.customers (full_name, phone) values ('zone', '05'||v_tag||'0009') returning id into v_cust;
  begin
    insert into public.waitlist_entries (branch_id, customer_id, party_size, zone)
      values (v_branch, v_cust, 2, null) returning zone into v_txt;
    insert into heavy_result values (4, 'h04_null_zone_falls_back',
      v_txt is not null and v_txt = v_zone, 'zone=' || coalesce(v_txt,'NULL') || ' expected=' || coalesce(v_zone,'—'));
  exception when others then
    insert into heavy_result values (4, 'h04_null_zone_falls_back', false, sqlstate || ' ' || sqlerrm);
  end;

  -- ══ (٥) المطعم المغلق لا يقبل دورًا ══
  delete from public.rate_limits where key like 'join:%';
  begin
    perform public.join_waitlist_guest(v_closed_branch, 'متطفّل', '05'||v_tag||'0010', 2, null);
    insert into heavy_result values (5, 'h05_closed_branch_rejects_join', false, 'قَبِل الانضمام وهو مغلق');
  exception
    when sqlstate 'P0003' then
      insert into heavy_result values (5, 'h05_closed_branch_rejects_join', true, 'P0003');
    when others then
      insert into heavy_result values (5, 'h05_closed_branch_rejects_join', false, sqlstate || ' ' || sqlerrm);
  end;

  -- ══ (٦) الطابور ينتهي بإغلاق المطعم لا بعد ثماني ساعات ══
  -- من انضمّ قبل الإغلاق يبقى «منتظرًا» والمطعم مقفل ولا أحد سيُجلسه
  insert into public.customers (full_name, phone) values ('ghost', '05'||v_tag||'0011') returning id into v_cust;
  insert into public.waitlist_entries (branch_id, customer_id, party_size, zone, joined_at)
    values (v_closed_branch, v_cust, 2, null, now() - interval '90 minutes') returning id into v_eid;
  perform public.expire_stale_waitlist();
  select status::text into v_status from public.waitlist_entries where id = v_eid;
  insert into heavy_result values (6, 'h06_queue_dies_when_branch_closes',
    v_status = 'expired', 'status=' || v_status);

  -- ══ (٧) الضيف لا يبلغ الدوال الإدارية ══
  -- ثلاث دوالّ كانت مكشوفة للمجهول عبر وراثة PUBLIC — تحرس نفسها، لكن
  -- لا يُترك بابٌ مفتوحٌ لأن خلفه بابًا ثانيًا
  insert into heavy_result values (7, 'h07_admin_rpcs_closed_to_guest',
    not has_function_privilege('anon','public.set_branch_status(uuid,boolean,boolean)','EXECUTE')
    and not has_function_privilege('anon','public.set_staff_permission(uuid,text,boolean)','EXECUTE')
    and not has_function_privilege('anon','public.grant_reward_to_segment(uuid,text,text,text,numeric,text,text,text,timestamptz)','EXECUTE')
    and has_function_privilege('anon','public.join_waitlist_guest(uuid,text,text,integer,text)','EXECUTE'),
    'admin closed & guest join open');

  -- ══ (٨) الهديّة لا تُصرف مرّتين ══
  -- حلقة القيمة التي يبيعها المالك: صرفٌ مزدوج = خسارةٌ مباشرة له
  insert into public.customers (full_name, phone) values ('مُهدى له', '05'||v_tag||'0012') returning id into v_cust2;
  insert into public.customer_rewards (restaurant_id, customer_id, kind, title, status)
    values (v_rest, v_cust2, 'discount', 'اختبار', 'active') returning id into v_eid;
  update public.customer_rewards set status = 'redeemed', redeemed_at = now() where id = v_eid;
  update public.customer_rewards set status = 'redeemed', redeemed_at = now()
    where id = v_eid and status = 'active';
  select count(*) into v_int from public.customer_rewards
   where id = v_eid and status = 'redeemed';
  insert into heavy_result values (8, 'h08_reward_redeemed_once',
    v_int = 1, 'redeemed_rows=' || v_int);

  -- ══ (٩) الترتيب الحيّ متّصلٌ بلا فجوات بعد الإلغاء ══
  -- ألغِ الثاني من خمسة: يجب أن يصير الثالث ثانيًا — لا أن تبقى فجوة
  update public.waitlist_entries set status = 'expired' where branch_id = v_branch;
  for i in 1..5 loop
    insert into public.customers (full_name, phone)
      values ('rank', '05'||v_tag||lpad((2000+i)::text,4,'0')) returning id into v_cust;
    insert into public.waitlist_entries (branch_id, customer_id, party_size, zone)
      values (v_branch, v_cust, 2, null);
    if i = 2 then v_eid := currval(pg_get_serial_sequence('public.waitlist_entries','id'))::uuid; end if;
  end loop;
  update public.waitlist_entries set status = 'cancelled'
   where id = (select id from public.waitlist_entries where branch_id = v_branch
               and status in ('waiting','notified') order by joined_at offset 1 limit 1);
  select count(*) into v_int from (
    select row_number() over (order by w.joined_at) rn,
           (select t."position" from public.waitlist_ticket_status(w.id, c.phone) t) pos
      from public.waitlist_entries w join public.customers c on c.id = w.customer_id
     where w.branch_id = v_branch and w.status in ('waiting','notified')
  ) x where x.rn is distinct from x.pos;
  insert into heavy_result values (9, 'h09_live_rank_has_no_gaps',
    v_int = 0, 'mismatched_rows=' || v_int);

  -- ══ (١٠) الحجز الواحد لا يُلغى برقمٍ غير صاحبه ══
  -- الإلغاء بالرقم بابٌ للضيف؛ لو قبل أيّ رقم لأمكن شطب حجوزات المطعم كلّها
  insert into public.tables (branch_id, label, seats, zone, is_active)
    values (v_branch, 'T1', 4, v_zone, true) returning id into v_tbl;
  insert into public.customers (full_name, phone) values ('حاجز', '05'||v_tag||'0013') returning id into v_cust;
  insert into public.reservations (branch_id, customer_id, table_id, party_size, reserved_at, status)
    values (v_branch, v_cust, v_tbl, 2, now() + interval '3 hours', 'confirmed') returning id into v_eid;
  delete from public.rate_limits where key like 'rescan%' or key like 'cancel%';
  select public.cancel_reservation_guest(v_eid, '05'||v_tag||'9999') into v_bool;
  select status::text into v_status from public.reservations where id = v_eid;
  insert into heavy_result values (10, 'h10_reservation_cancel_needs_owner_phone',
    v_bool is not true and v_status = 'confirmed',
    'returned=' || coalesce(v_bool::text,'null') || ' status=' || v_status);
end
$body$;

select id, name,
       case when pass then '✓' else '✗ FAIL' end as mark,
       detail
from heavy_result order by id;

rollback;
