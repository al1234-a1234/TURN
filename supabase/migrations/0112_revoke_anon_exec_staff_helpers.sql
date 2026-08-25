-- ٠١١٢ — تصحيح ٠١١١: السحب كان من PUBLIC، والمنح فعليًّا صريحٌ لـanon
--
-- ٠١١١ نفّذ `revoke ... from public` ظنًّا أنّ صلاحية anon موروثةٌ من
-- المنح الافتراضي لـPUBLIC. لكن فحص proacl بعد التطبيق أظهر أن anon يملك
-- منحًا صريحًا مباشرًا (على الأرجح من إعداد المشروع الأولي:
-- `grant execute on all functions in schema public to anon, authenticated`)
-- لا يُسحَب بسحب PUBLIC — فبقيت الدوال الثلاث عشرة قابلة للتنفيذ من anon
-- كما كانت رغم ٠١١١. هذا يسحبها من anon صراحةً.

revoke execute on function public.audit_row_delete() from anon;
revoke execute on function public.can_access_branch(uuid) from anon;
revoke execute on function public.has_feature(uuid, text) from anon;
revoke execute on function public.is_brand_manager(uuid) from anon;
revoke execute on function public.is_manager_of(uuid) from anon;
revoke execute on function public.is_platform_admin() from anon;
revoke execute on function public.is_staff_of(uuid) from anon;
revoke execute on function public.my_branch_ids() from anon;
revoke execute on function public.my_branch_ids_for(text) from anon;
revoke execute on function public.my_managed_branch_ids() from anon;
revoke execute on function public.queue_version(uuid) from anon;
revoke execute on function public.restaurant_of_branch(uuid) from anon;
revoke execute on function public.staff_can_read_customer(uuid) from anon;
