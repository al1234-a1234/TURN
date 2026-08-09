-- ════ تحصين الإطلاق (٢/٣): سحب الدوال الإدارية من المجهول ════
--
-- ثلاث دوالّ إدارية كانت قابلة للاستدعاء من الضيف: إغلاق فرع، وتغيير
-- صلاحيات موظّف، ومنح هدايا لشريحة عملاء. وكلّها تحرس نفسها في أوّل سطر
-- (‏is_manager_of / staff_has_perm / is_platform_admin) فليست ثغرةً حيّة —
-- لكن لا يُترك بابٌ مفتوحٌ لأن خلفه بابًا ثانيًا.
--
-- والدرس الأهمّ هنا: `revoke ... from anon` وحده لم يغيّر شيئًا. الصلاحية
-- موروثة من PUBLIC (بوستجرس يمنحها افتراضيًّا لكل دالّة)، فيبدو التحصين
-- منجزًا وهو لم يقع. تُسحب من PUBLIC ثم تُمنح للمخوَّلين صراحةً.
revoke execute on function public.set_branch_status(uuid, boolean, boolean) from public, anon;
grant  execute on function public.set_branch_status(uuid, boolean, boolean) to authenticated, service_role;

revoke execute on function public.set_staff_permission(uuid, text, boolean) from public, anon;
grant  execute on function public.set_staff_permission(uuid, text, boolean) to authenticated, service_role;

revoke execute on function public.grant_reward_to_segment(uuid, text, text, text, numeric, text, text, text, timestamptz) from public, anon;
grant  execute on function public.grant_reward_to_segment(uuid, text, text, text, numeric, text, text, text, timestamptz) to authenticated, service_role;

-- ودوالّ التريغر لا يناديها أحد: التريغر ينفّذها بصلاحية المالك
revoke execute on function public.enforce_branch_queue_cap() from public, anon, authenticated;
revoke execute on function public.enforce_reservation_hold_cap() from public, anon, authenticated;
revoke execute on function public.canonicalize_customer_phone() from public, anon, authenticated;
