-- استكمال عزل الفروع: التقييمات واستهلاك العروض تحمل branch_id،
-- فيجب أن يراها موظّف الفرع لفرعه فقط (الصفوف القديمة بلا فرع تبقى للمطعم).

drop policy if exists "staff reads all reviews" on public.reviews;
create policy "staff reads all reviews" on public.reviews
  for select
  using (
    is_platform_admin()
    or (is_staff_of(restaurant_id) and (branch_id is null or can_access_branch(branch_id)))
  );

drop policy if exists "managers manage reviews" on public.reviews;
create policy "managers manage reviews" on public.reviews
  for all
  using (
    is_platform_admin()
    or (staff_has_perm(restaurant_id, 'reviews') and (branch_id is null or can_access_branch(branch_id)))
  )
  with check (
    is_platform_admin()
    or (staff_has_perm(restaurant_id, 'reviews') and (branch_id is null or can_access_branch(branch_id)))
  );

drop policy if exists "staff reads redemptions" on public.offer_redemptions;
create policy "staff reads redemptions" on public.offer_redemptions
  for select
  using (
    is_platform_admin()
    or (is_staff_of(restaurant_id) and (branch_id is null or can_access_branch(branch_id)))
  );
