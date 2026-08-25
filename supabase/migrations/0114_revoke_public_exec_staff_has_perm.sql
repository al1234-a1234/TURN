-- ٠١١٤ — تصحيح ٠١١٣: staff_has_perm بقيت مفتوحة لـanon عبر منح PUBLIC
--
-- عكس الحالة في ٠١١١/٠١١٢ تمامًا: staff_has_perm لم يكن لها منحٌ صريحٌ
-- مباشر لـanon، بل proacl أظهر `=X/postgres` وحدها (منح PUBLIC الافتراضي)
-- بلا سطر anon=X مستقل — فسحب ٠١١٣ (من anon فقط) لم يغيّر شيئًا؛ العضوية
-- الضمنية في PUBLIC بقيت تمنح anon التنفيذ. هذا يسحب من PUBLIC أيضًا،
-- تمامًا كما فُعل بالثلاث عشرة الأخرى في ٠١١١.

revoke execute on function public.staff_has_perm(uuid, text) from public;
grant execute on function public.staff_has_perm(uuid, text) to authenticated;
