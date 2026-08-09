-- رمز تملّك المطعم كان معروضًا للعالم — ولم يظهر لأنّ المطاعم واحد.
--
-- السلسلة كاملةً:
--   ١) سياسة «public read active restaurants» تقول `using (is_active = true)`،
--      و‏RLS يحكم الصفوف لا الأعمدة — فالضيف يقرأ كلّ عمودٍ في الصفّ المسموح.
--   ٢) ومن أعمدة الجدول `claim_code`.
--   ٣) و‏`claim_restaurant(p_code)` تشترط تسجيل الدخول فحسب، ثم تكتب
--      `owner_id = auth.uid()` وتُدخل صفّ طاقمٍ بدور `owner`.
--
-- فالهجوم: يفتح المهاجم حسابًا عاديًّا، ثم يقرأ بالمفتاح العلني
-- `select slug, claim_code from restaurants where claim_code is not null`،
-- ثم ينادي `claim_restaurant` بكلّ رمز — فيصير مالكًا لكلّ مطعمٍ لم يُسلَّم
-- بعد: قوائم العملاء وأرقامهم، والطابور، والإعدادات.
--
-- ولماذا لم نره ثلاثين يومًا؟ لأنّ في القاعدة مطعمًا واحدًا رمزُه `null`
-- (أُنشئ يدويًّا لا عبر التجهيز). والثغرة تُولد حيّةً لحظة تجهيز الخمسة
-- والعشرين: كلّ مطعمٍ يحمل رمزًا صالحًا حتى يستلمه صاحبه — وتلك بالضبط
-- هي أيام التسليم.
--
-- ومعه يتسرّب `owner_username` و`owner_phone` و`email`: بياناتُ خمسةٍ
-- وعشرين صاحب مطعمٍ يقرؤها أيُّ زائر.

-- ═══ (١) الصلاحية على مستوى العمود — لأنّ RLS لا يفعلها ═══
-- ‏`from anon` وحدها لا تكفي: الصلاحية موروثةٌ عن PUBLIC، وسحبُها عن
-- الوريث دون المورِّث يبدو منجزًا وهو لم يقع. (درسٌ دفعناه في 0089.)
revoke select on public.restaurants from public, anon, authenticated;

-- ما يحتاجه الموقع العام ولوحة المالك فعلًا — لا أكثر.
-- ‏`owner_id` و`is_active` مذكوران لأنّ سياسات RLS تقرأهما، والبقيةُ
-- تقرؤها الواجهات (فحصتُ الأربعة عشر استدعاءً كلّها: لا واحد منها
-- يطلب رمزًا ولا اسم دخولٍ ولا هاتف مالك).
grant select (
  id, owner_id, name, name_en, slug, logo_url, cover_url,
  description, is_active, created_at, updated_at,
  claimed_at, links, cuisine, cuisine_en, phone
) on public.restaurants to anon, authenticated;

-- والكتابة المباشرة لا يحتاجها الضيف أصلًا: ما يكتب إنّما يكتب عبر
-- دوالّ SECURITY DEFINER، وهي تعمل بصلاحية مالكها لا بصلاحيته.
revoke insert, update, delete on public.restaurants from public, anon;

-- ═══ (٢) لوحة مدير المنصّة تُبدَّل بدالّة، لا بصلاحيةٍ مفتوحة ═══
-- كانت `/admin` تقرأ العمودين مباشرةً — ومنعُهما عنها يعطّلها. فبدل أن
-- نُبقي البابين مفتوحين لكلّ مسجَّلٍ من أجل مديرٍ واحد، نفتحهما له وحده.
create or replace function public.admin_restaurants_list()
returns table (
  id uuid, name text, slug text,
  owner_username text, owner_phone text,
  is_active boolean, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not public.is_platform_admin() then
    raise exception 'غير مصرّح' using errcode = '42501';
  end if;

  return query
    select r.id, r.name, r.slug, r.owner_username, r.owner_phone,
           r.is_active, r.created_at
      from public.restaurants r
     order by r.created_at desc;
end $function$;

revoke execute on function public.admin_restaurants_list() from public, anon;
grant  execute on function public.admin_restaurants_list() to authenticated, service_role;

-- ═══ (٣) الرمز يُولَّد من مولّدٍ تشفيري ═══
-- كان يُبنى على `random()`، وهي مصفوفةٌ ببذرةٍ في الجلسة: من عرف رمزًا
-- واحدًا ووقتَ توليده يضيّق فضاء الباقي. و‏`gen_random_uuid()` تأخذ من
-- مولّد النظام. والطيّ على ٣٢ بلا انحياز: ٢٥٦ تقبل القسمة على ٣٢ تمامًا.
create or replace function public.gen_claim_code()
returns text
language plpgsql
set search_path to ''
as $function$
declare
    alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- بلا O/0/I/1/L
    code text;
    raw  text;
    i int;
begin
    loop
        code := '';
        raw := replace(gen_random_uuid()::text, '-', '');  -- ٣٢ خانةً ستّ عشرية
        for i in 1..8 loop
            code := code || substr(
              alphabet,
              1 + (('x' || substr(raw, i * 2 - 1, 2))::bit(8)::int % 32),
              1
            );
        end loop;
        exit when not exists (select 1 from public.restaurants where claim_code = code);
    end loop;
    return code;
end $function$;

-- ═══ (٤) سقفٌ على محاولات التملّك ═══
-- إخفاء الرمز يمنع القراءة، والسقف يمنع التخمين والكنس: حسابٌ واحد
-- لا يجرّب أكثر من خمس مرّاتٍ في الساعة، والمنصّة كلّها لا تتجاوز
-- ثلاثين — فمحاولةُ مسحٍ شاملةٍ تموت في أوّلها لا في آخرها.
-- والدالّة تُعاد كاملةً لا مُرقَّعة: تعديلُ جزءٍ من دالّةٍ أمنيّة بلا
-- إعادة قراءة بقيّتها هو باب الأخطاء الصامتة.
create or replace function public.claim_restaurant(p_code text)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_uid uuid := auth.uid();
    v_rest public.restaurants%rowtype;
begin
    if v_uid is null then
        raise exception 'يجب تسجيل الدخول' using errcode = '28000';
    end if;

    if not public.check_rate('claim:u:' || v_uid::text, 5, interval '1 hour') then
        raise exception 'محاولات كثيرة — جرّب بعد ساعة' using errcode = 'P0429';
    end if;
    if not public.check_rate('claim:global', 30, interval '1 hour') then
        raise exception 'محاولات كثيرة — جرّب بعد ساعة' using errcode = 'P0429';
    end if;

    select * into v_rest from public.restaurants
     where claim_code = upper(trim(p_code))
     limit 1;

    -- رسالةٌ واحدةٌ للحالتين عمدًا: التفريق بين «خطأ» و«مستعمَل» يُخبر
    -- المخمّن أنّه أصاب رمزًا حقيقيًّا.
    if v_rest.id is null then
        raise exception 'رمز غير صحيح أو مُستخدَم مسبقًا' using errcode = 'P0002';
    end if;

    update public.restaurants
       set owner_id = v_uid, claim_code = null, claimed_at = now()
     where id = v_rest.id;

    insert into public.staff (user_id, restaurant_id, role)
        values (v_uid, v_rest.id, 'owner')
        on conflict (user_id, restaurant_id) do nothing;

    return v_rest.slug;
end $function$;
