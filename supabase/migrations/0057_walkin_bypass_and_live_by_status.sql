-- 0057: دفعة إصلاحات المراجعة الشاملة — الطابور الحي والاستقبال.
--
-- أ) walk-in الاستقبال كان يمرّ عبر join_waitlist_guest فيَفشل بصمت متى
--    كان الفرع «مغلقًا يدويًا» أو خارج الدوام — فالمضيف الذي أقفل الانضمام
--    الإلكتروني ما عاد يقدر يضيف الواقف على الباب. دالة موظّف مخصّصة
--    تتجاوز بوابة الإغلاق (بحقّ الفرع فقط) وبلا حدّ معدّل الضيوف.
--
-- ب) «الحيّ = يوم الرياض» كان يبخّر طابور ما بعد منتصف الليل: من انضم
--    ٢٣:٥٠ يختفي من الشاشات عند ٠٠:٠٠ ويُقتل expired عند ٠٠:٠٥ وهو واقف.
--    التعريف الجديد: الحيّ = waiting/notified، والتقادم بالعمر (٨ ساعات،
--    كل ساعة) بدل حدود اليوم — فتسقط فلاتر اليوم من العدّادات والتذكرة.

-- ── أ) إضافة الاستقبال ──
create or replace function public.staff_add_walkin(
  p_branch_id uuid,
  p_full_name text,
  p_phone text,
  p_party_size integer default 1,
  p_zone text default 'inside'
)
returns table(queue_pos integer, entry_id uuid)
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_name  text := coalesce(nullif(trim(p_full_name), ''), 'ضيف');
  v_phone text := trim(p_phone);
  v_party int  := greatest(coalesce(p_party_size, 1), 1);
  v_zone  text := case when p_zone in ('inside','outside') then p_zone else 'inside' end;
  v_cust_id uuid;
  v_pos int;
  v_eid uuid;
begin
  if not public.can_access_branch(p_branch_id) then
    raise exception 'غير مصرّح' using errcode = '42501';
  end if;
  if v_phone = '' then
    raise exception 'الرقم مطلوب' using errcode = '22023';
  end if;

  -- عنده صف حيّ في هذا الفرع؟ نعيده بدل التكرار
  select w."position", w.id into v_pos, v_eid
    from public.waitlist_entries w
    join public.customers c on c.id = w.customer_id
   where w.branch_id = p_branch_id
     and c.phone = v_phone
     and w.status in ('waiting','notified')
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
      update public.customers set full_name = v_name where id = v_cust_id;
    end if;
  exception when unique_violation then
    select id into v_cust_id from public.customers where phone = v_phone and user_id is null limit 1;
  end;

  begin
    insert into public.waitlist_entries (branch_id, customer_id, party_size, zone)
         values (p_branch_id, v_cust_id, v_party, v_zone)
      returning waitlist_entries."position", id into v_pos, v_eid;
  exception when unique_violation then
    select w."position", w.id into v_pos, v_eid
      from public.waitlist_entries w
     where w.branch_id = p_branch_id and w.customer_id = v_cust_id
       and w.status in ('waiting','notified')
     limit 1;
  end;

  queue_pos := v_pos; entry_id := v_eid; return next;
end $$;

revoke execute on function public.staff_add_walkin(uuid, text, text, integer, text) from public, anon;
grant execute on function public.staff_add_walkin(uuid, text, text, integer, text) to authenticated;

-- ── ب) التقادم بالعمر بدل منتصف الليل ──
create or replace function public.expire_stale_waitlist()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare n int;
begin
  update public.waitlist_entries set status = 'expired'
   where status in ('waiting','notified')
     and joined_at < now() - interval '8 hours';
  get diagnostics n = row_count;
  return n;
end $$;

do $$ begin
  perform cron.unschedule('expire-stale');
exception when others then null; end $$;
select cron.schedule('expire-stale', '5 * * * *', 'SELECT public.expire_stale_waitlist()');

-- العدّادات: الحيّ بالحالة فقط (العمر يضبطه التقادم أعلاه)
create or replace function public.waitlist_counts(b_id uuid)
returns table(total integer, inside integer, outside integer)
language sql stable security definer
set search_path to ''
as $$
  select
    count(*)::int,
    count(*) filter (where zone = 'inside')::int,
    count(*) filter (where zone = 'outside')::int
  from public.waitlist_entries
  where branch_id = b_id
    and status in ('waiting', 'notified');
$$;

create or replace function public.waitlist_counts_for(p_branch_ids uuid[])
returns table(branch_id uuid, total bigint, inside bigint, outside bigint)
language sql stable security definer
set search_path to 'public'
as $$
  select w.branch_id,
         count(*),
         count(*) filter (where w.zone = 'inside'),
         count(*) filter (where w.zone = 'outside')
  from public.waitlist_entries w
  where w.status in ('waiting','notified')
    and w.branch_id = any(p_branch_ids)
  group by w.branch_id;
$$;

create or replace function public.waitlist_ticket_status(p_entry_id uuid, p_phone text)
returns table(status text, "position" integer, ahead integer, total integer)
language sql stable security definer
set search_path to ''
as $$
  with me as (
    select w.branch_id, w.zone, w.status::text as status, w."position" as pos
    from public.waitlist_entries w
    join public.customers c on c.id = w.customer_id
    where w.id = p_entry_id
      and c.phone = trim(p_phone)
  ),
  ahead_cte as (
    select count(*)::int as n
    from public.waitlist_entries w2, me
    where w2.branch_id = me.branch_id
      and w2.zone is not distinct from me.zone
      and w2.status in ('waiting','notified')
      and w2."position" < me.pos
  ),
  total_cte as (
    select count(*)::int as n
    from public.waitlist_entries w3, me
    where w3.branch_id = me.branch_id
      and w3.zone is not distinct from me.zone
      and w3.status in ('waiting','notified')
  )
  select
    me.status,
    (ahead_cte.n + 1) as "position",
    ahead_cte.n       as ahead,
    total_cte.n       as total
  from me, ahead_cte, total_cte;
$$;
