-- 0062: «المالك مالك» — قرار المالك بعد تجربة حساب مطعمه:
-- حساب دوره owner يتحكم بكل ما يظهر للعميل عن مطعمه (الشعار، الغلاف،
-- الاسم، الوصف، والتقييمات كلها) حتى لو كان الحساب مربوطًا بفرع.
-- التقييد السابق (مالك العلامة = غير مربوط بفرع فقط) كان يحرم حساب
-- مالك المطعم الفعلي من صور مطعمه وتقييماته.
-- الفرانشايز يبقى محفوظًا عبر الأدوار: الشريك يُنشأ manager/host مربوطًا
-- بفرعه فلا يمس العلامة؛ أما owner فلا يُمنح إلا لصاحب المطعم نفسه.
create or replace function public.is_brand_manager(rest_id uuid)
returns boolean
language sql stable security definer
set search_path to ''
as $$
  select public.is_platform_admin() or exists (
    select 1 from public.staff s
    where s.user_id = (select auth.uid())
      and s.is_active
      and s.restaurant_id = rest_id
      and (
        s.role = 'owner'
        or (s.role = 'manager' and s.branch_id is null)
      )
  );
$$;

-- التقييمات: المالك يدير (ويقرأ) تقييمات مطعمه كلها بكل فروعها
alter policy "managers manage reviews" on public.reviews
  using (
    is_platform_admin()
    or is_brand_manager(restaurant_id)
    or (staff_has_perm(restaurant_id, 'reviews') and (branch_id is null or can_access_branch(branch_id)))
  );

alter policy "staff reads all reviews" on public.reviews
  using (
    is_platform_admin()
    or is_brand_manager(restaurant_id)
    or (is_staff_of(restaurant_id) and (branch_id is null or branch_id = any (coalesce((select my_branch_ids()), array[]::uuid[]))))
  );
