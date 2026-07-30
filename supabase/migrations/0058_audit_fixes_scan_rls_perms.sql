-- 0058: دفعة إصلاحات المراجعة الشاملة — القاعدة.
--
-- ١) «امسح خذ هديتك» كان مكسورًا لكل عميل جديد يترك حقل الاسم (المكتوب
--    «اختياري») فارغًا: public_checkin تُدخل full_name = NULL والعمود
--    NOT NULL → خطأ 23502 ورسالة «تعذّل التسجيل» — قناة الاكتساب الأولى
--    ميتة لمن لا يكتب اسمه. الحل: اسم افتراضي «ضيف» كبقية المسارات.
do $fix$
declare src text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'public_checkin';
  src := replace(src,
    $$values (nullif(btrim(coalesce(p_name,'')), ''), '0' || v_norm)$$,
    $$values (coalesce(nullif(btrim(coalesce(p_name,'')), ''), 'ضيف'), '0' || v_norm)$$);
  execute src;
end $fix$;

-- ٢) عميل المسح لم يكن يظهر في «العملاء» ولا في بحث الكاونتر: القراءة كانت
--    عبر الطابور/الحجوزات فقط، ومسار المسح يكتب في checkins.
create or replace function public.staff_can_read_customer(cust_id uuid)
returns boolean
language sql stable security definer
set search_path to ''
as $$
  select public.is_platform_admin()
      or exists (select 1 from public.waitlist_entries w
                  where w.customer_id = cust_id
                    and w.branch_id = any (coalesce((select public.my_branch_ids()), array[]::uuid[])))
      or exists (select 1 from public.reservations r
                  where r.customer_id = cust_id
                    and r.branch_id = any (coalesce((select public.my_branch_ids()), array[]::uuid[])))
      or exists (select 1 from public.checkins k
                  where k.customer_id = cust_id
                    and k.branch_id = any (coalesce((select public.my_branch_ids()), array[]::uuid[])));
$$;

-- ٣) الصلاحيات المفوَّضة كانت «كذبة واجهة»: التطبيق يفتح شاشات القائمة
--    والطاولات وإعدادات الفرع وقواعد المسح لحامل الصلاحية، وسياسات RLS
--    تشترط مديرًا — فتفشل الكتابة بصمت وتظهر الواجهة نجاحًا. مواءمة:
--    السياسة تقبل المدير أو حامل الصلاحية المناسبة، دائمًا ضمن فرعه.
alter policy "managers manage menu categories" on public.menu_categories
  using ((is_manager_of(restaurant_id) or staff_has_perm(restaurant_id, 'settings')) and can_access_branch(branch_id))
  with check ((is_manager_of(restaurant_id) or staff_has_perm(restaurant_id, 'settings')) and can_access_branch(branch_id));

alter policy "managers manage menu items" on public.menu_items
  using ((is_manager_of(restaurant_id) or staff_has_perm(restaurant_id, 'settings')) and can_access_branch(branch_id))
  with check ((is_manager_of(restaurant_id) or staff_has_perm(restaurant_id, 'settings')) and can_access_branch(branch_id));

alter policy "managers manage settings" on public.branch_settings
  using ((is_manager_of(restaurant_of_branch(branch_id)) or staff_has_perm(restaurant_of_branch(branch_id), 'settings')) and can_access_branch(branch_id))
  with check ((is_manager_of(restaurant_of_branch(branch_id)) or staff_has_perm(restaurant_of_branch(branch_id), 'settings')) and can_access_branch(branch_id));

alter policy "managers manage tables" on public.tables
  using ((is_manager_of(restaurant_of_branch(branch_id)) or staff_has_perm(restaurant_of_branch(branch_id), 'settings')) and can_access_branch(branch_id))
  with check ((is_manager_of(restaurant_of_branch(branch_id)) or staff_has_perm(restaurant_of_branch(branch_id), 'settings')) and can_access_branch(branch_id));

alter policy "checkin_settings_write" on public.checkin_settings
  using ((is_manager_of(restaurant_id) or staff_has_perm(restaurant_id, 'loyalty')) and can_access_branch(branch_id))
  with check ((is_manager_of(restaurant_id) or staff_has_perm(restaurant_id, 'loyalty')) and can_access_branch(branch_id));

-- ٤) تنظيف مفتاح «offers» الميت من قائمة صلاحيات set_staff_permission
do $fix2$
declare src text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'set_staff_permission';
  src := replace(src, $$'analytics','offers','loyalty'$$, $$'analytics','loyalty'$$);
  execute src;
end $fix2$;
