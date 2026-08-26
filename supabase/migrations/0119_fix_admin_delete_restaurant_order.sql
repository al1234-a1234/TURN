-- ٠١١٩ — تصحيح ٠١١٨: حذف المطعم أولًا، ثم الحسابات اليتيمة
--
-- اختبار فعلي (begin/rollback ببيانات صناعية) كشف أن ٠١١٨ يحذف حساب
-- auth.users قبل صفّ المطعم — لكن `restaurants_owner_id_fkey` قيدُه
-- ON DELETE RESTRICT (لا CASCADE كما ظُنّ)، فيرفض حذف حساب مالكٍ لا يزال
-- owner_id لمطعمٍ قائم. الترتيب الصحيح: نحذف صفّ المطعم أولًا (يُسقط
-- staff تبعًا لـCASCADE فتصير كل شروط "لا وجود آخر" صحيحة)، ثم نحذف
-- الحسابات اليتيمة.

create or replace function public.admin_delete_restaurant(p_restaurant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_uid uuid;
  v_candidates uuid[];
begin
  if not public.is_platform_admin() then
    raise exception 'غير مصرّح' using errcode = '42501';
  end if;

  select owner_id into v_owner from public.restaurants where id = p_restaurant_id;

  select array_agg(distinct u) into v_candidates
  from (
    select user_id as u from public.staff where restaurant_id = p_restaurant_id
    union
    select v_owner where v_owner is not null
  ) s
  where u is not null;

  delete from public.restaurants where id = p_restaurant_id;

  if v_candidates is not null then
    foreach v_uid in array v_candidates
    loop
      if not exists (select 1 from public.staff where user_id = v_uid)
         and not exists (select 1 from public.restaurants where owner_id = v_uid)
         and not exists (select 1 from public.platform_admins where user_id = v_uid)
      then
        delete from auth.users where id = v_uid;
      end if;
    end loop;
  end if;
end;
$$;
