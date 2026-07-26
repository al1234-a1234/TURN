-- ============================================================================
--  عزل الفروع في RLS — الإصلاح الجذري.
--
--  المشكلة: كل السياسات كانت على مستوى المطعم (is_staff_of(restaurant_id))،
--  وعزل الفروع كان في طبقة الاستعلام بالتطبيق فقط — حاجز شكلي لا أمني.
--  مُثبت عمليًّا: موظّف مربوط بـ«الفرع الرئيسي» كان يقرأ ٧٨٦ صف طابور و١٢٠٧
--  حجزًا من الفرع الآخر عبر الـAPI. في الفرانشايز هذا خرق كامل.
--
--  الحل: مسند واحد can_access_branch يُستخدم في كل جدول له branch_id:
--    • مشرف المنصّة → كل شيء
--    • حساب غير مربوط بفرع (مالك العلامة) → كل فروع مطعمه
--    • حساب مربوط بفرع → فرعه فقط
--  فيصبح العزل مفروضًا في القاعدة، ولا ينكسر ولو أخطأ التطبيق أو نُودي الـAPI مباشرة.
-- ============================================================================

create or replace function public.can_access_branch(b_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select public.is_platform_admin() or exists (
    select 1
    from public.staff s
    join public.branches br on br.id = b_id
    where s.user_id = (select auth.uid())
      and s.is_active
      and s.restaurant_id = br.restaurant_id
      and (s.branch_id is null or s.branch_id = b_id)
  );
$function$;

-- ── الطابور ──
drop policy if exists "staff manages branch waitlist" on public.waitlist_entries;
create policy "staff manages branch waitlist" on public.waitlist_entries
  for all using (public.can_access_branch(branch_id))
  with check (public.can_access_branch(branch_id));

-- ── الحجوزات ──
drop policy if exists "staff manages branch reservations" on public.reservations;
create policy "staff manages branch reservations" on public.reservations
  for all using (public.can_access_branch(branch_id))
  with check (public.can_access_branch(branch_id));

-- ── الطاولات ──
drop policy if exists "staff read tables" on public.tables;
create policy "staff read tables" on public.tables
  for select using (public.can_access_branch(branch_id));
drop policy if exists "managers manage tables" on public.tables;
create policy "managers manage tables" on public.tables
  for all using (public.is_manager_of(public.restaurant_of_branch(branch_id)) and public.can_access_branch(branch_id))
  with check (public.is_manager_of(public.restaurant_of_branch(branch_id)) and public.can_access_branch(branch_id));

-- ── إعدادات الفرع ──
drop policy if exists "staff reads settings" on public.branch_settings;
create policy "staff reads settings" on public.branch_settings
  for select using (public.can_access_branch(branch_id));
drop policy if exists "managers manage settings" on public.branch_settings;
create policy "managers manage settings" on public.branch_settings
  for all using (public.is_manager_of(public.restaurant_of_branch(branch_id)) and public.can_access_branch(branch_id))
  with check (public.is_manager_of(public.restaurant_of_branch(branch_id)) and public.can_access_branch(branch_id));

-- ── التنبيهات والإحصاءات اليومية ──
drop policy if exists "staff reads notifications" on public.notifications;
create policy "staff reads notifications" on public.notifications
  for select using (public.can_access_branch(branch_id));

drop policy if exists "staff reads own daily stats" on public.daily_stats;
create policy "staff reads own daily stats" on public.daily_stats
  for select using (public.can_access_branch(branch_id));

-- ── القائمة (القراءة العامّة تبقى كما هي للعملاء) ──
drop policy if exists "managers manage menu categories" on public.menu_categories;
create policy "managers manage menu categories" on public.menu_categories
  for all using (public.is_manager_of(restaurant_id) and public.can_access_branch(branch_id))
  with check (public.is_manager_of(restaurant_id) and public.can_access_branch(branch_id));

drop policy if exists "managers manage menu items" on public.menu_items;
create policy "managers manage menu items" on public.menu_items
  for all using (public.is_manager_of(restaurant_id) and public.can_access_branch(branch_id))
  with check (public.is_manager_of(restaurant_id) and public.can_access_branch(branch_id));

-- ── العروض ──
drop policy if exists "staff reads all offers" on public.offers;
create policy "staff reads all offers" on public.offers
  for select using (public.can_access_branch(branch_id));
drop policy if exists "managers manage offers" on public.offers;
create policy "managers manage offers" on public.offers
  for all using (public.staff_has_perm(restaurant_id, 'offers') and public.can_access_branch(branch_id))
  with check (public.staff_has_perm(restaurant_id, 'offers') and public.can_access_branch(branch_id));

-- ── الصور ──
drop policy if exists "managers manage photos" on public.restaurant_photos;
create policy "managers manage photos" on public.restaurant_photos
  for all using (public.staff_has_perm(restaurant_id, 'settings') and public.can_access_branch(branch_id))
  with check (public.staff_has_perm(restaurant_id, 'settings') and public.can_access_branch(branch_id));

-- ── تسجيلات المسح (branch_id يقبل NULL للصفوف القديمة) ──
drop policy if exists "checkins_read" on public.checkins;
create policy "checkins_read" on public.checkins
  for select using (
    public.is_platform_admin()
    or (branch_id is null and public.is_staff_of(restaurant_id))
    or public.can_access_branch(branch_id)
  );

-- ── إعدادات «امسح خذ هديتك» ──
drop policy if exists "checkin_settings_read" on public.checkin_settings;
create policy "checkin_settings_read" on public.checkin_settings
  for select using (public.can_access_branch(branch_id));
drop policy if exists "checkin_settings_write" on public.checkin_settings;
create policy "checkin_settings_write" on public.checkin_settings
  for all using (public.is_manager_of(restaurant_id) and public.can_access_branch(branch_id))
  with check (public.is_manager_of(restaurant_id) and public.can_access_branch(branch_id));

-- ── الفريق: مدير الفرع لا يدير موظّفي فرع آخر ──
drop policy if exists "staff read team" on public.staff;
create policy "staff read team" on public.staff
  for select using (
    public.is_staff_of(restaurant_id)
    and (branch_id is null or public.can_access_branch(branch_id))
  );
drop policy if exists "managers manage team" on public.staff;
create policy "managers manage team" on public.staff
  for all using (
    public.is_manager_of(restaurant_id)
    and (branch_id is null or public.can_access_branch(branch_id))
  )
  with check (
    public.is_manager_of(restaurant_id)
    and (branch_id is null or public.can_access_branch(branch_id))
  );
