-- ═══ الموجة ٣ — HIGH-1: ربط قراءة بيانات العميل بخريطة الصلاحيات ═══
--
-- العطل: الدالّة كانت تصرّح بالعضويّة وحدها (my_branch_ids())، فموظّفٌ كلّ
-- صلاحياته false يقرأ اسم الضيف وجوّاله. أُثبت على المحاكاة ببصمةٍ مطابقة.
--
-- ولمَ لا نكتفي بـ my_branch_ids_for('customers')؟ لأنّ مضيفَين حقيقيَّين في
-- Eficto يحملان customers:false و reservations:true، ولوحة الحجوزات تقرأ
-- الاسم بضمّ PostgREST (reception/page.tsx:77) الذي يمرّ بهذه السياسة —
-- فمنعُهما يعني مضيفًا مخوَّلًا بإدارة حجزٍ لا يرى صاحبه. (أمّا أسماء
-- الطابور فمن staff_branch_queue عند السطر ٧١، فلا تتأثّر أصلًا.)
create or replace function public.staff_can_read_customer(cust_id uuid)
returns boolean language sql stable security definer set search_path to '' as $fn$
  select public.is_platform_admin()
      or exists (select 1 from public.waitlist_entries w
                  where w.customer_id = cust_id
                    and w.branch_id = any (coalesce((select public.my_branch_ids_for('waitlist')), array[]::uuid[])))
      or exists (select 1 from public.reservations r
                  where r.customer_id = cust_id
                    and r.branch_id = any (coalesce((select public.my_branch_ids_for('reservations')), array[]::uuid[])))
      or exists (select 1 from public.customer_restaurant cr
                  join public.branches b2 on b2.restaurant_id = cr.restaurant_id
                 where cr.customer_id = cust_id
                   and b2.id = any (coalesce((select public.my_branch_ids_for('customers')), array[]::uuid[])));
$fn$;
