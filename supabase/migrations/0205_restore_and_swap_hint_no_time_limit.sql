-- المالك جرّب سجلّ اليوم حيًّا واعترض صراحةً على نافذتَي الـ١٥ دقيقة:
-- «لا المفروض يكون ثابت كلهن التبديل والتنزيل يمديني ارجعه لو بكره».
-- يزيل هذا الترحيل الحدّ الزمنيّ من موضعين:
--
-- ١) restore_queue_entry (0169): كانت ترفض الإرجاع بعد ١٥ دقيقة من
--    الإزالة/الجلوس الخاطئ (P0413 «انتهت مهلة الإرجاع»). صار بإمكان
--    الموظّف الإرجاع في أي وقت — حتى لو بعد يوم. الحارس الوحيد المتبقّي:
--    ألّا يكون العميل قد عاد فعلًا للطابور بمساره الخاص (فحصٌ سابقٌ في
--    الدالّة، لم يُمَسّ). CREATE OR REPLACE يكفي — التوقيع ونوع الإرجاع
--    (uuid) لم يتغيّرا، فقط الجسم.
--
-- ٢) branch_day_log (0203/0204): علَمُ restorable في السجل كان يوافق
--    نفس الـ١٥ دقيقة — فيختفي زرّ «إرجاع» من الشاشة رغم أن الدالّة تحته
--    كانت لتقبل (بعد إزالة الحدّ في ١). الآن يبقى العلَم صحيحًا ما دام لم
--    يُرجَع العميل فعلًا (شرط not exists لم يتغيّر) — بلا سقفٍ زمنيّ.
--    RETURNS TABLE لم يتغيّر (لا عمود أُضيف ولا أُزيل) فـCREATE OR REPLACE
--    يكفي هنا أيضًا — لا حاجة لـDROP.

create or replace function public.restore_queue_entry(p_entry_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_old record;
  v_existing uuid;
  v_new_id uuid;
  v_rank int;
begin
  select w.id, w.branch_id, w.customer_id, w.zone, w.party_size, w.status, w.joined_at
    into v_old
    from public.waitlist_entries w
   where w.id = p_entry_id
     for update;

  if v_old.id is null then
    raise exception 'الحركة غير موجودة' using errcode = 'P0404';
  end if;

  if not (public.is_platform_admin()
          or v_old.branch_id = any (coalesce(public.my_branch_ids_for('waitlist'), array[]::uuid[]))) then
    raise exception 'غير مخوّل' using errcode = '42501';
  end if;

  if v_old.status not in ('cancelled','expired','no_show','seated') then
    raise exception 'لا يُرجَع صفٌّ ما زال في الطابور' using errcode = 'P0412';
  end if;

  -- خموليّة: من عاد إلى الطابور (بإرجاعٍ سابق أو بانضمامه بنفسه) لا يُكرَّر.
  -- وهذا أيضًا ما يمنع اصطدام uniq_waitlist_live_customer_branch.
  select w.id into v_existing
    from public.waitlist_entries w
   where w.branch_id = v_old.branch_id
     and w.customer_id = v_old.customer_id
     and w.status in ('waiting','notified')
   limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  -- صفٌّ جديد: position = NULL عمدًا ⇒ set_waitlist_position يولّده لنفس
  -- (فرع، قسم) تحت قفل الفرع، وEXCLUDE يحرسه.
  insert into public.waitlist_entries (branch_id, customer_id, party_size, zone)
       values (v_old.branch_id, v_old.customer_id, v_old.party_size, v_old.zone)
    returning id into v_new_id;

  select count(*)::int + 1 into v_rank
    from public.waitlist_entries w2
   where w2.branch_id = v_old.branch_id
     and w2.zone is not distinct from v_old.zone
     and w2.status in ('waiting','notified')
     and w2."position" < (select w3."position" from public.waitlist_entries w3 where w3.id = v_new_id)
     and w2.joined_at > now() - interval '8 hours';

  insert into public.queue_events (branch_id, entry_id, customer_id, kind, zone, from_rank, to_rank, actor, detail)
  values (v_old.branch_id, v_new_id, v_old.customer_id, 'restored', v_old.zone,
          (select e.from_rank from public.queue_events e
            where e.entry_id = p_entry_id and e.kind <> 'restored'
            order by e.at desc limit 1),
          v_rank, (select auth.uid()),
          jsonb_build_object('restored_from', p_entry_id, 'from_status', v_old.status::text));

  return v_new_id;
end
$function$;

create or replace function public.branch_day_log(
  p_branch_id uuid,
  p_limit integer default 50,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table(
  event_id uuid,
  entry_id uuid,
  kind text,
  zone text,
  from_rank integer,
  to_rank integer,
  at timestamptz,
  customer_name text,
  actor_name text,
  counterpart_name text,
  restorable boolean
)
language sql
stable security definer
set search_path to ''
as $function$
  select e.id, e.entry_id, e.kind, e.zone, e.from_rank, e.to_rank, e.at,
         c.full_name,
         s.name,
         case when e.kind = 'swapped' then e.detail->>'with_name' else null end,
         (e.kind in ('cancelled','expired','no_show','seated')
          and not exists (
            select 1 from public.waitlist_entries w
             where w.branch_id = e.branch_id and w.customer_id = e.customer_id
               and w.status in ('waiting','notified')))
    from public.queue_events e
    left join public.customers c on c.id = e.customer_id
    left join public.staff s on s.user_id = e.actor and s.restaurant_id =
         (select b.restaurant_id from public.branches b where b.id = e.branch_id)
   where e.branch_id = p_branch_id
     and e.at > coalesce(p_from, now() - interval '8 hours')
     and e.at <= coalesce(p_to, now())
     and (public.is_platform_admin()
          or e.branch_id = any (coalesce(public.my_branch_ids_for('waitlist'), array[]::uuid[])))
   order by e.at desc
   limit least(greatest(coalesce(p_limit, 50), 1), case when p_from is null then 200 else 1000 end);
$function$;
