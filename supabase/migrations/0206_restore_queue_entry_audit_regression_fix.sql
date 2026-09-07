-- انحدار من ٠٢٠٥: حين أزلت سقف الـ١٥ دقيقة من restore_queue_entry أعدت
-- كتابة الدالّة من نسخةٍ سابقة لـ٠١٨٦ (الذي كان أضاف سطر تدقيق
-- admin_audit بعملية 'queue:restore') — فسقط سطر التدقيق سهوًا. اكتشفه
-- الفحص اليومي الآلي (w53_privileged_actions_audited راسب). هذا الترحيل
-- يعيد نفس سطر التدقيق من ٠١٨٦ حرفيًّا، فوق جسم ٠٢٠٥ (بلا سقف ١٥ دقيقة)
-- بلا أي تغيير آخر.

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

  select w.id into v_existing
    from public.waitlist_entries w
   where w.branch_id = v_old.branch_id
     and w.customer_id = v_old.customer_id
     and w.status in ('waiting','notified')
   limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

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

  insert into public.admin_audit (actor, action, restaurant_id, branch_id, detail)
  values ((select auth.uid()), 'queue:restore',
          public.restaurant_of_branch(v_old.branch_id), v_old.branch_id,
          jsonb_build_object('from_entry', p_entry_id, 'to_entry', v_new_id,
                             'from_status', v_old.status::text));

  return v_new_id;
end
$function$;
