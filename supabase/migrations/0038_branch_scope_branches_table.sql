-- ثقب كتابة متبقٍّ: «مدير المطعم» كان يعدّل/يعطّل أيّ فرع في المطعم — ومنه
-- فرع فرانشايز آخر. المربوط بفرع يديره وحده؛ وغير المربوط (مالك العلامة)
-- يدير الكل ويقدر ينشئ فروعًا جديدة.

drop policy if exists "staff read branches" on public.branches;
create policy "staff read branches" on public.branches
  for select using (public.can_access_branch(id));

drop policy if exists "managers manage branches" on public.branches;
create policy "managers manage branches" on public.branches
  for all
  using (public.is_manager_of(restaurant_id) and public.can_access_branch(id))
  with check (
    public.is_manager_of(restaurant_id)
    and (
      public.is_platform_admin()
      or exists (
        select 1 from public.staff s
        where s.user_id = (select auth.uid())
          and s.is_active
          and s.restaurant_id = branches.restaurant_id
          and (s.branch_id is null or s.branch_id = branches.id)
      )
    )
  );
