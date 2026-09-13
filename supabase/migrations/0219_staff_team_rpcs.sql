-- طاقم المطعم (staff) يحمل نفس نمط RLS غير الملفوف اللي أصلحناه في العملاء
-- والتقييمات: staff_has_perm(restaurant_id,'team') يُفحص لكل صفٍّ بدل مرّة
-- واحدة. آمنٌ اليوم (عدد الموظفين صغير)، لكن مطعمًا أكبر بفريقٍ أكبر يفعّله.
-- أخطر موقعين: عدّاد الطاقم في شريط اللوحة (يُحسب بكل صفحة لكل موظّف)،
-- وصفحة «الموظفون والصلاحيات» نفسها (الجلب الكامل).

create function public.staff_active_count(p_restaurant_id uuid)
returns bigint
language sql
stable security definer
set search_path to ''
as $function$
  select count(*)
  from public.staff s
  where s.restaurant_id = p_restaurant_id
    and s.is_active = true
    and (public.staff_has_perm(p_restaurant_id, 'team') or public.is_platform_admin())
    and (s.branch_id is null or public.can_access_branch(s.branch_id));
$function$;

revoke all on function public.staff_active_count(uuid) from public, anon;
grant execute on function public.staff_active_count(uuid) to authenticated;

create function public.staff_team_rows(p_restaurant_id uuid)
returns table(
  id uuid,
  name text,
  role public.user_role,
  permissions jsonb,
  is_active boolean,
  branch_id uuid
)
language sql
stable security definer
set search_path to ''
as $function$
  select s.id, s.name, s.role, s.permissions, s.is_active, s.branch_id
  from public.staff s
  where s.restaurant_id = p_restaurant_id
    and s.is_active = true
    and (public.staff_has_perm(p_restaurant_id, 'team') or public.is_platform_admin())
    and (s.branch_id is null or public.can_access_branch(s.branch_id))
  order by s.role;
$function$;

revoke all on function public.staff_team_rows(uuid) from public, anon;
grant execute on function public.staff_team_rows(uuid) to authenticated;
