-- ٠١١٧ — HOTFIX عاجل: استعادة EXECUTE لـanon على دوالٍّ يستعملها RLS فعليًّا
--
-- حادثة إنتاج حقيقية: ٠١١١-٠١١٤ سحبت EXECUTE من anon عن ١٤ دالّة، بناءً
-- على تحقّقٍ من pg_policies بحث عن 'anon' حرفيًّا داخل roles — فاته أن
-- سياسةً بلا TO صريح تُسجَّل بـroles={public} لا {anon}، وPUBLIC يشمل
-- anon فعليًّا. النتيجة: سياسات SELECT حقيقية على restaurants
-- ("staff read own restaurant": is_staff_of(id)) وbranch_settings
-- ("staff reads settings": my_branch_ids()) — كلتاهما roles={public} —
-- صارت تفشل بـ"permission denied for function ..." متى قيّمها anon، لأن
-- PostgreSQL يجمع كل سياسات SELECT بـOR ويحتاج EXECUTE على كل دالّةٍ
-- تظهر في أي شرط، بصرف النظر عن نتيجته النهائية للمستخدم.
--
-- الأثر: الصفحة الرئيسية (getDiscovery) وr/[slug] (getRestaurantMeta)
-- تكسران لكل زائرٍ مجهول منذ ~٠٠:٠٠ UTC (رُصد عبر Vercel runtime errors:
-- ٣٥ مستخدمًا متأثرًا على الأقل). هذا الترحيل يُصلحه فورًا بإعادة EXECUTE
-- لـanon على كل الدوال الثلاث عشرة من ٠١١١/٠١١٢ زائد staff_has_perm من
-- ٠١١٣/٠١١٤ — عودةٌ كاملة لحالة ما قبل الليلة لهذه المجموعة تحديدًا.
--
-- check_platform_health (٠١١٥/٠١١٦) مُستثناة عمدًا: دالّةٌ جديدة، لا
-- سياسة RLS تشير إليها، لا علاقة لها بهذا العطب — تبقى مقصورة كما هي.
--
-- الدرس: التحقّق الصحيح من "هل هذه الدالة تلزم anon عبر RLS؟" يحتاج فحص
-- roles @> ARRAY['public']::name[] OR roles @> ARRAY['anon']::name[]،
-- لا 'anon' = any(roles) وحدها. سيُستعمل هذا الشكل في أي تضييقٍ مستقبلي.

grant execute on function public.audit_row_delete() to anon;
grant execute on function public.can_access_branch(uuid) to anon;
grant execute on function public.has_feature(uuid, text) to anon;
grant execute on function public.is_brand_manager(uuid) to anon;
grant execute on function public.is_manager_of(uuid) to anon;
grant execute on function public.is_platform_admin() to anon;
grant execute on function public.is_staff_of(uuid) to anon;
grant execute on function public.my_branch_ids() to anon;
grant execute on function public.my_branch_ids_for(text) to anon;
grant execute on function public.my_managed_branch_ids() to anon;
grant execute on function public.queue_version(uuid) to anon;
grant execute on function public.restaurant_of_branch(uuid) to anon;
grant execute on function public.staff_can_read_customer(uuid) to anon;
grant execute on function public.staff_has_perm(uuid, text) to anon;
