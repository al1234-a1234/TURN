-- ٠١١٨ — أدوات ذاتية للأدمن: حذف مطعم، وإخفاؤه عن الجمهور (اختبار خاص)
--
-- لم يكن في الواجهة زر حذف إطلاقًا — الحذف الوحيد حتى الآن تمّ يدويًّا عبر
-- SQL مباشر (تنظيف "تجربة حيّة"). هذا يبنيه دالّةً ذاتية الخدمة يستدعيها
-- الأدمن من /admin، بنفس حذر التنظيف اليدوي بالضبط:
--
-- (أ) حساب أي مستخدمٍ مرتبط بالمطعم (موظّفًا أو مالكًا) يُحذف معه، **فقط
--     إن لم يكن له وجودٌ آخر** — موظّفًا في مطعمٍ ثانٍ، مالكًا لمطعمٍ آخر،
--     أو مشرف منصّة — وإلا فحذف حسابه يقطع دخوله عن أماكن لا علاقة لها
--     بهذا المطعم. هذا الشرط بالضبط ما تحقّقتُ منه يدويًّا قبل حذف
--     "تجربة حيّة" (حسابا @turn.app صناعيّان بلا استخدامٍ آخر).
-- (ب) حذف صفّ المطعم نفسه يكفي بعدها — كل الجداول التابعة (فروع، طاولات،
--     قائمة، صور، تقييمات، ...) لها CASCADE أصلًا (تحقّقتُ عبر pg_constraint).
--
-- والإخفاء عن الجمهور: العمود `is_canary` (٠٠٩٥) موجودٌ أصلًا ويُستثنى به
-- مطعمٌ من كل استعلامات الاكتشاف العامّة (الرئيسية، البحث، صفحة المطعم
-- نفسها) — هو نفس الآلية التي يعمل بها "نبض دور" اليوم. هذا يكشفها للأدمن
-- كمفتاحٍ بسيط بدل تعديل قاعدة بيانات يدويًّا لكل مطعم اختبار.

drop function if exists public.admin_restaurants_list();

create function public.admin_restaurants_list()
returns table(
  id uuid, name text, slug text, owner_username text, owner_phone text,
  is_active boolean, is_canary boolean, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'غير مصرّح' using errcode = '42501';
  end if;

  return query
    select r.id, r.name, r.slug, r.owner_username, r.owner_phone,
           r.is_active, r.is_canary, r.created_at
      from public.restaurants r
     order by r.created_at desc;
end
$$;

revoke execute on function public.admin_restaurants_list() from public;
revoke execute on function public.admin_restaurants_list() from anon;
grant execute on function public.admin_restaurants_list() to authenticated;

-- ── حذف مطعم كامل (الأدمن فقط) ──────────────────────────────────────────
create or replace function public.admin_delete_restaurant(p_restaurant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_uid uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'غير مصرّح' using errcode = '42501';
  end if;

  select owner_id into v_owner from public.restaurants where id = p_restaurant_id;

  for v_uid in
    select distinct u from (
      select user_id as u from public.staff where restaurant_id = p_restaurant_id
      union
      select v_owner where v_owner is not null
    ) s
    where u is not null
  loop
    if not exists (select 1 from public.staff where user_id = v_uid and restaurant_id <> p_restaurant_id)
       and not exists (select 1 from public.restaurants where owner_id = v_uid and id <> p_restaurant_id)
       and not exists (select 1 from public.platform_admins where user_id = v_uid)
    then
      delete from auth.users where id = v_uid;
    end if;
  end loop;

  delete from public.restaurants where id = p_restaurant_id;
end;
$$;

revoke execute on function public.admin_delete_restaurant(uuid) from public;
revoke execute on function public.admin_delete_restaurant(uuid) from anon;
grant execute on function public.admin_delete_restaurant(uuid) to authenticated;

-- ── إخفاء/إظهار مطعم عن الاكتشاف العامّ (الأدمن فقط) ────────────────────
create or replace function public.admin_set_restaurant_canary(p_restaurant_id uuid, p_canary boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'غير مصرّح' using errcode = '42501';
  end if;
  update public.restaurants set is_canary = p_canary where id = p_restaurant_id;
end;
$$;

revoke execute on function public.admin_set_restaurant_canary(uuid, boolean) from public;
revoke execute on function public.admin_set_restaurant_canary(uuid, boolean) from anon;
grant execute on function public.admin_set_restaurant_canary(uuid, boolean) to authenticated;
