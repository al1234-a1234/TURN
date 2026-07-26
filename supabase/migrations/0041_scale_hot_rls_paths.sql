-- مسارات RLS الساخنة تحت الحمل: كانت السياسات تستدعي دالة لكل صف
-- (can_access_branch = قراءتا فهرس لكل صف، و staff_can_read_customer حلقة
-- متداخلة فوقها). مع ٥٠ ألف عميل تصبح لوحة واحدة مئات آلاف الاستدعاءات.
-- الحل: مصفوفة فروع المتصل تُحسب مرة واحدة لكل استعلام (InitPlan) ثم
-- فحص = ANY رخيص لكل صف. سياسات الكتابة تبقى على can_access_branch.

create or replace function public.my_branch_ids()
returns uuid[]
language sql stable security definer set search_path to ''
as $function$
  select case
    when public.is_platform_admin()
      then (select coalesce(array_agg(id), '{}') from public.branches)
    else (select coalesce(array_agg(br.id), '{}')
            from public.staff s
            join public.branches br on br.restaurant_id = s.restaurant_id
           where s.user_id = (select auth.uid())
             and s.is_active
             and (s.branch_id is null or s.branch_id = br.id))
  end;
$function$;
grant execute on function public.my_branch_ids() to authenticated, anon;

-- المسندات المساعدة على نمط InitPlan (كانت تستدعي auth.uid() عاريًا لكل صف)
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path to ''
as $function$
  select exists (select 1 from public.platform_admins pa where pa.user_id = (select auth.uid()));
$function$;

create or replace function public.is_staff_of(rest_id uuid)
returns boolean language sql stable security definer set search_path to ''
as $function$
  select exists (
    select 1 from public.staff s
    where s.user_id = (select auth.uid()) and s.restaurant_id = rest_id and s.is_active
  );
$function$;

create or replace function public.is_manager_of(rest_id uuid)
returns boolean language sql stable security definer set search_path to ''
as $function$
  select exists (
    select 1 from public.staff s
    where s.user_id = (select auth.uid()) and s.restaurant_id = rest_id
      and s.is_active and s.role in ('owner','manager')
  );
$function$;

-- حارس ملف العميل: فحص مصفوفة بدل حلقة استدعاءات لكل زيارة
create or replace function public.staff_can_read_customer(cust_id uuid)
returns boolean language sql stable security definer set search_path to ''
as $function$
  select public.is_platform_admin()
      or exists (select 1 from public.waitlist_entries w
                  where w.customer_id = cust_id
                    and w.branch_id = any (coalesce((select public.my_branch_ids()), array[]::uuid[])))
      or exists (select 1 from public.reservations r
                  where r.customer_id = cust_id
                    and r.branch_id = any (coalesce((select public.my_branch_ids()), array[]::uuid[])));
$function$;

-- السياسات الساخنة (قراءات الجداول الكبيرة)
drop policy if exists "staff manages branch waitlist" on public.waitlist_entries;
create policy "staff manages branch waitlist" on public.waitlist_entries
  for all
  using (branch_id = any (coalesce((select public.my_branch_ids()), array[]::uuid[])))
  with check (branch_id = any (coalesce((select public.my_branch_ids()), array[]::uuid[])));

drop policy if exists "staff manages branch reservations" on public.reservations;
create policy "staff manages branch reservations" on public.reservations
  for all
  using (branch_id = any (coalesce((select public.my_branch_ids()), array[]::uuid[])))
  with check (branch_id = any (coalesce((select public.my_branch_ids()), array[]::uuid[])));

drop policy if exists "staff reads notifications" on public.notifications;
create policy "staff reads notifications" on public.notifications
  for select using (branch_id = any (coalesce((select public.my_branch_ids()), array[]::uuid[])));

drop policy if exists "staff reads own daily stats" on public.daily_stats;
create policy "staff reads own daily stats" on public.daily_stats
  for select using (branch_id = any (coalesce((select public.my_branch_ids()), array[]::uuid[])));

drop policy if exists "staff read tables" on public.tables;
create policy "staff read tables" on public.tables
  for select using (branch_id = any (coalesce((select public.my_branch_ids()), array[]::uuid[])));

drop policy if exists "staff reads settings" on public.branch_settings;
create policy "staff reads settings" on public.branch_settings
  for select using (branch_id = any (coalesce((select public.my_branch_ids()), array[]::uuid[])));

drop policy if exists "staff reads all offers" on public.offers;
create policy "staff reads all offers" on public.offers
  for select using (branch_id = any (coalesce((select public.my_branch_ids()), array[]::uuid[])));

drop policy if exists "checkins_read" on public.checkins;
create policy "checkins_read" on public.checkins
  for select using (
    public.is_platform_admin()
    or (branch_id is null and public.is_staff_of(restaurant_id))
    or branch_id = any (coalesce((select public.my_branch_ids()), array[]::uuid[]))
  );

drop policy if exists "checkin_settings_read" on public.checkin_settings;
create policy "checkin_settings_read" on public.checkin_settings
  for select using (branch_id = any (coalesce((select public.my_branch_ids()), array[]::uuid[])));

drop policy if exists "staff reads all reviews" on public.reviews;
create policy "staff reads all reviews" on public.reviews
  for select
  using (
    is_platform_admin()
    or (is_staff_of(restaurant_id)
        and (branch_id is null or branch_id = any (coalesce((select public.my_branch_ids()), array[]::uuid[]))))
  );

drop policy if exists "staff reads redemptions" on public.offer_redemptions;
create policy "staff reads redemptions" on public.offer_redemptions
  for select
  using (
    is_platform_admin()
    or (is_staff_of(restaurant_id)
        and (branch_id is null or branch_id = any (coalesce((select public.my_branch_ids()), array[]::uuid[]))))
  );
