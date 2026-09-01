-- ═══ تراجع ٠١٨٨ — إيقاف استبقاء البيانات الشخصيّة ═══
-- (لا يُعيد بياناتٍ أُخمِلت — الإخمال غير قابلٍ للعكس بحكم تعريفه.
--  يوقف الجدولة فقط ويُعيد الدالّة اليدويّة إلى نصّها السابق.)
select cron.unschedule('pii-retention')
 where exists (select 1 from cron.job where jobname = 'pii-retention');

drop function if exists public.run_pii_retention();

-- إعادة retire_dormant_customers إلى نصّها قبل ٠١٨٨ (بـ NULL — وهي معطوبة
-- بـ23502 لأنّ full_name NOT NULL؛ نُعيدها كما كانت لا كما ينبغي)
create or replace function public.retire_dormant_customers(p_months integer default 24)
 returns integer language plpgsql security definer set search_path to ''
as $function$
declare n int; v_months int;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  v_months := greatest(coalesce(p_months, 24), 6);
  update public.customers c
     set full_name = null, email = null,
         phone = 'retired:' || substr(md5(coalesce(c.phone,'') || c.id::text), 1, 12)
   where c.user_id is null
     and coalesce(c.phone,'') not like 'retired:%'
     and not exists (select 1 from public.waitlist_entries w
                      where w.customer_id = c.id
                        and w.joined_at > now() - make_interval(months => v_months))
     and not exists (select 1 from public.reservations r
                      where r.customer_id = c.id
                        and r.created_at > now() - make_interval(months => v_months))
     and not exists (select 1 from public.customer_rewards cr
                      where cr.customer_id = c.id and cr.status = 'active')
     and c.created_at < now() - make_interval(months => v_months);
  get diagnostics n = row_count;
  return n;
end $function$;

-- إعادة بصمة q20 إلى ١٥٨ دالّة
do $rb$
declare d text; d2 text;
begin
  select pg_get_functiondef(oid) into d from pg_proc
   where proname='run_critical_checks' and pronamespace='public'::regnamespace;
  d2 := replace(d, 'and p.prokind=''f'') = 159', 'and p.prokind=''f'') = 158');
  if d2 <> d then execute d2; end if;
end $rb$;
