-- ════ تحصين الإطلاق (١/٣): أسقفٌ صلبة وتقييس الرقم ════
--
-- السياق: تسليم ٢٥ مطعمًا وألف زائر يوميًّا، مع احتمال خصمٍ يقصد التعطيل.
-- والحدود القائمة كانت تُقاس بالرقم أو بالفرع: ٣ انضمامات لكل رقم/١٠د،
-- و٦٠٠ لكل فرع/دقيقة. والمهاجم يملك أرقامًا بلا حدّ (١٠٠ مليون احتمال)،
-- فيحقن ٦٠٠ صفًّا وهميًّا كل دقيقة بلا سقفٍ للمجموع — ٣٦ ألفًا في الساعة.
-- والعميل الحقيقي يفتح الرئيسية فيرى «٦٠٠٠ بالانتظار» فيمشي، والاستقبال
-- يعجز عن العمل. لا سرقة بيانات، بل قتل المنتج في يوم عرضه.
--
-- والحدّ الزمني وحده لا يكفي: العلاج سقفٌ للمخزون لا للتدفّق.

-- (١) الحارس يملأ القسم الفارغ بدل أن يمرّره إلى عمودٍ NOT NULL.
--     كان `if new.zone is null ... then return new` يمرّر NULL كما هو،
--     فيموت الإدخال بـ23502 برسالةٍ لا يفهمها العميل ولا الموظّف.
create or replace function public.enforce_zone_belongs_to_branch()
returns trigger language plpgsql security definer set search_path to '' as $function$
declare v_fallback text;
begin
  select z.key into v_fallback from public.branch_zones z
  where z.branch_id = new.branch_id and z.is_active
  order by z.sort_order, z.created_at limit 1;
  if new.zone is not null and new.zone <> 'any' and exists (
       select 1 from public.branch_zones z
       where z.branch_id = new.branch_id and z.key = new.zone and z.is_active) then
    return new;
  end if;
  if v_fallback is null then return new; end if;
  new.zone := v_fallback;
  return new;
end $function$;

-- (٢) سقفٌ صلب للطابور الحيّ: ٣٠٠ صفًّا لكل فرع.
--     مطعمٌ بأربعين طاولة لا يبلغ عُشره في أشدّ لياليه، وألف زائر موزّعين
--     على ٢٥ مطعمًا يعني ٤٠ للمطعم في اليوم كلّه. فالسقف لا يلمس واقعًا،
--     ويحصر التخريب في عددٍ يمسحه الاستقبال في دقائق.
create or replace function public.enforce_branch_queue_cap()
returns trigger language plpgsql security definer set search_path to '' as $function$
declare v_live int; v_cap constant int := 300;
begin
  select count(*) into v_live from public.waitlist_entries w
   where w.branch_id = new.branch_id and w.status in ('waiting','notified');
  if v_live >= v_cap then
    raise exception 'الطابور ممتلئ حاليًا — جرّب بعد قليل' using errcode = 'P0430';
  end if;
  return new;
end $function$;

drop trigger if exists trg_branch_queue_cap on public.waitlist_entries;
create trigger trg_branch_queue_cap before insert on public.waitlist_entries
for each row execute function public.enforce_branch_queue_cap();

-- (٣) سقف الحجوزات القادمة لرقمٍ واحد في فرعٍ واحد.
--     الحجز أثمن من الدور: كلٌّ منه يحتجز طاولةً حقيقية ويحرمها من عميل.
create or replace function public.enforce_reservation_hold_cap()
returns trigger language plpgsql security definer set search_path to '' as $function$
declare v_held int; v_cap constant int := 5;
begin
  select count(*) into v_held from public.reservations r
   where r.branch_id = new.branch_id and r.customer_id = new.customer_id
     and r.status in ('pending','confirmed') and r.reserved_at > now();
  if v_held >= v_cap then
    raise exception 'عندك حجوزات كثيرة في هذا الفرع' using errcode = 'P0431';
  end if;
  return new;
end $function$;

drop trigger if exists trg_reservation_hold_cap on public.reservations;
create trigger trg_reservation_hold_cap before insert on public.reservations
for each row execute function public.enforce_reservation_hold_cap();

-- (٤) الرقم يُقيَّس عند الكتابة كما يُقيَّس عند القراءة.
--     القراءة تطابق على ٩ أرقام (norm_phone_input)، والكتابة كانت تحفظ
--     ما وصل حرفيًّا — فمن كتب «+966 50…» صار عميلًا ثانيًا بهويّةٍ ثانية:
--     دورٌ ثانٍ في نفس الطابور، وزياراته وهداياه منقسمة بين صفّين.
create or replace function public.canonicalize_customer_phone()
returns trigger language plpgsql security definer set search_path to '' as $function$
declare v_norm text;
begin
  v_norm := public.norm_phone_input(coalesce(new.phone, ''));
  if v_norm ~ '^5[0-9]{8}$' then new.phone := '0' || v_norm; end if;
  return new;
end $function$;

drop trigger if exists trg_customer_phone_canonical on public.customers;
create trigger trg_customer_phone_canonical before insert or update of phone on public.customers
for each row execute function public.canonicalize_customer_phone();
