-- ٠١١٣ — staff_has_perm فاتت المسح في ٠١١٢: نفس النمط، نفس الإصلاح
--
-- staff_has_perm(rest_id uuid, p_perm text) دالّةٌ مساعدةٌ داخليةٌ أخرى
-- تعتمد على auth.uid() لا معاملًا صريحًا للهويّة، تُستعمَل فقط من
-- dashboard/customers/actions.ts (مسارٌ للموظّف المسجَّل)، ولا سياسة RLS
-- واحدة تُتيحها لـanon (تحقّقنا عبر pg_policies) — فاتت مسح ٠١١١/٠١١٢
-- لأنها لم تُدرَج في القائمة الأولى. نفس المعالجة.

revoke execute on function public.staff_has_perm(uuid, text) from anon;
