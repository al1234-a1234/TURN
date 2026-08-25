-- ٠١١١ — سحب EXECUTE الافتراضي (PUBLIC) عن دوال مساعدة داخلية للموظفين فقط
--
-- فاحص أمان Supabase (get_advisors) كشف أن ١٣ دالّة SECURITY DEFINER
-- مساعدة — يُفترض استعمالها من الكود الموثَّق للموظف/المالك فقط
-- (is_staff_of، is_platform_admin، can_access_branch، my_branch_ids، ...) —
-- تحمل صلاحية EXECUTE الافتراضية لـPUBLIC (ومنها anon) لأن PostgreSQL
-- يمنحها ضمنًا عند الإنشاء ما لم تُسحب صراحة.
--
-- الخطر عمليًّا محدود: كلها تعتمد داخليًّا على auth.uid() (لا على معامل
-- هوية صريح)، فمناداتها من anon بلا جلسة تُرجع false/null غالبًا، ولا
-- سياسة RLS واحدة تُتيحها لـanon (تحقّقنا عبر pg_policies). لكنها مع ذلك
-- مسطح استدعاءٍ لا داعي لبقائه مفتوحًا — تضييقه هو الممارسة الصحيحة
-- (أقل امتياز)، ولا يكسر شيئًا: SECURITY DEFINER يُنفَّذ بصلاحية المالك
-- عند مناداتها من دوالٍّ أخرى، فسحب PUBLIC لا يمسّ الاستدعاء الداخلي.
--
-- الدوال الفعليّة المخصَّصة للضيف (tv_queue، reservation_slots،
-- waitlist_ticket_status، waitlist_counts_for، waitlist_counts_by_zone،
-- waitlist_ticket_by_id، health_snapshot) مُستثناة عمدًا — احتياجها لـanon
-- موثَّقٌ ومختبَرٌ في critical_checks.sql (browser_reads_open، anon_can_ticket،
-- anon_can_health) ولا تُمسّ هنا.

revoke execute on function public.audit_row_delete() from public;
revoke execute on function public.can_access_branch(uuid) from public;
revoke execute on function public.has_feature(uuid, text) from public;
revoke execute on function public.is_brand_manager(uuid) from public;
revoke execute on function public.is_manager_of(uuid) from public;
revoke execute on function public.is_platform_admin() from public;
revoke execute on function public.is_staff_of(uuid) from public;
revoke execute on function public.my_branch_ids() from public;
revoke execute on function public.my_branch_ids_for(text) from public;
revoke execute on function public.my_managed_branch_ids() from public;
revoke execute on function public.queue_version(uuid) from public;
revoke execute on function public.restaurant_of_branch(uuid) from public;
revoke execute on function public.staff_can_read_customer(uuid) from public;

grant execute on function public.audit_row_delete() to authenticated;
grant execute on function public.can_access_branch(uuid) to authenticated;
grant execute on function public.has_feature(uuid, text) to authenticated;
grant execute on function public.is_brand_manager(uuid) to authenticated;
grant execute on function public.is_manager_of(uuid) to authenticated;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.is_staff_of(uuid) to authenticated;
grant execute on function public.my_branch_ids() to authenticated;
grant execute on function public.my_branch_ids_for(text) to authenticated;
grant execute on function public.my_managed_branch_ids() to authenticated;
grant execute on function public.queue_version(uuid) to authenticated;
grant execute on function public.restaurant_of_branch(uuid) to authenticated;
grant execute on function public.staff_can_read_customer(uuid) to authenticated;
