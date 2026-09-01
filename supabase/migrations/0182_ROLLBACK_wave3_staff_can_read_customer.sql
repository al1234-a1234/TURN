-- ═══ تراجع الموجة ٣ (٠١٨١) — يُطبَّق فقط إن بلّغ الاستقبال عن أسماءٍ فارغة ═══
-- يعيد الدالّة إلى نسختها قبل ٠١٨١ حرفيًّا (عضويّة الفرع لا خريطة الصلاحيات).
-- بصمة النسخة المستعادة يجب أن تساوي: c7d99aee1bc8dbf03aff90cf53e8d9c8
create or replace function public.staff_can_read_customer(cust_id uuid)
returns boolean language sql stable security definer set search_path to '' as $fn$
  select public.is_platform_admin()
      or exists (select 1 from public.waitlist_entries w
                  where w.customer_id = cust_id
                    and w.branch_id = any (coalesce((select public.my_branch_ids()), array[]::uuid[])))
      or exists (select 1 from public.reservations r
                  where r.customer_id = cust_id
                    and r.branch_id = any (coalesce((select public.my_branch_ids()), array[]::uuid[])));
$fn$;
