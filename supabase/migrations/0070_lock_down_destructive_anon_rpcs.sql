-- إغلاق دالّتين مكشوفتين لـ anon بلا مبرّر — إحداهما تدمير بيانات بلا أي حارس.
--
-- (١) retire_dormant_customers — الأخطر في القاعدة كلها.
--     كانت SECURITY DEFINER وممنوحة لـ anon وبلا أي فحص صلاحية، وتقبل معاملًا
--     p_months يتحكّم به المتصل. مفتاح anon منشور في متصفّح كل زائر، فأيّ شخص
--     على الإنترنت كان يستطيع:
--         POST /rest/v1/rpc/retire_dormant_customers  {"p_months": 0}
--     وبـ p_months=0 تصير كل الشروط الزمنية صحيحة لكل صف، فتُمسح أسماء
--     وبُرد وأرقام كل العملاء الضيوف (عدا من له هديّة فعّالة) — والرقم يُستبدل
--     بتجزئة فلا رجعة. ولا يوجد PITR لاسترجاعها.
--     والدالة أصلًا غير مستدعاة لا في التطبيق ولا في الكرون (run_retention
--     يحذف owner_insights وpush_subscriptions فقط) — أي أنها كانت خطرًا صافيًا
--     بلا فائدة. نُبقيها كأداة امتثال (PDPL) لكن بثلاثة أقفال:
--         أ) سحب التنفيذ من anon و authenticated.
--         ب) حارس داخلي: مدير المنصّة فقط.
--         ج) حدّ أدنى للمعامل (٦ أشهر) فلا تمحو حديثًا حتى بالخطأ.
--
-- (٢) get_customer_rewards — نسخة قديمة سبقت rewards_by_phone وغير مستدعاة
--     في التطبيق، لكنها تُرجع أيضًا حقل code (رمز الهديّة) لأي رقم يُكتب.
--     سحب التنفيذ منها يقلّص سطح الهجوم بلا أثر وظيفي.
--
-- لا تغيير بيانات — صلاحيات وحارس فقط.

-- (١) ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.retire_dormant_customers(p_months integer DEFAULT 24)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  n int;
  v_months int;
begin
  -- حارس: مدير المنصّة وحده (والكرون/الخدمة يعملان بدور متجاوز فلا يتأثّران)
  if not public.is_platform_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- أرضية صلبة: لا تقاعد لأقل من ٦ أشهر مهما مرّر المتصل
  v_months := greatest(coalesce(p_months, 24), 6);

  update public.customers c
     set full_name = null, email = null,
         phone = 'retired:' || substr(md5(coalesce(c.phone,'') || c.id::text), 1, 12)
   where c.user_id is null
     and coalesce(c.phone,'') not like 'retired:%'
     and not exists (select 1 from public.waitlist_entries w
                      where w.customer_id = c.id
                        and w.joined_at > now() - make_interval(months => v_months))
     and not exists (select 1 from public.reservations r
                      where r.customer_id = c.id
                        and r.created_at > now() - make_interval(months => v_months))
     and not exists (select 1 from public.customer_rewards cr
                      where cr.customer_id = c.id and cr.status = 'active')
     and c.created_at < now() - make_interval(months => v_months);
  get diagnostics n = row_count;
  return n;
end $function$;

REVOKE ALL ON FUNCTION public.retire_dormant_customers(integer) FROM anon, authenticated, public;

-- (٢) ---------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_customer_rewards(text) FROM anon, authenticated, public;
