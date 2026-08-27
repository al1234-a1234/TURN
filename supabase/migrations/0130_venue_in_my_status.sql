-- 0130: اسم المطعم يعود في «دوري وحجزي» — قرار المشغّل الصريح
--
-- 0104 أخفت هوية المكان من الاستعلام بالرقم («الموقع كامل جائزة المهاجم»).
-- عاش القرار على الإنتاج وأنتج بطاقةً بلا اسم: «دورٌ قائم — ترتيبك ١» ولا
-- يعرف صاحبها في أي مطعم — حكم المشغّل عليها بالحرف: «ما في فايدة ما في
-- اسم المطعم ولا في شكل». الميزان انقلب بالاستعمال الفعلي: صاحب الدور
-- يفتح حسابه من جهازٍ جديد فلا يجد إلا لغزًا.
--
-- ما يبقى قائمًا من 0104 كاملًا: إخفاء الاسم الشخصي، الحدود المركّبة
-- (بالرقم وبالطالب وسقف الأرقام المختلفة لكل طالب — ٢٠/يوم)، السجل
-- المُملَّح، وإنذار العتبة. المُعاد: اسم المطعم ومعرّفه العلني فقط —
-- وهما ما يراه أي زائرٍ في الدليل أصلًا.
--
-- تغيير أعمدة الإرجاع يستلزم إسقاطًا وإعادة بناء — والمنح يُعاد ضبطه
-- بعدها صراحةً (درس 0120: المنح الافتراضي مفتوح).

drop function public.guest_status_by_phone(text, text);

create function public.guest_status_by_phone(p_phone text, p_ip text)
returns table(kind text, status text, at timestamptz, party_size integer, "position" integer, venue_name text, venue_slug text)
language plpgsql
security definer
set search_path to ''
as $fn$
declare v_p text; v_ip text; v_salt text; v_ok boolean; v_n integer := 0;
begin
  v_p := public.norm_phone_input(p_phone);
  if length(v_p) <> 9 then return; end if;
  v_ip := coalesce(nullif(btrim(p_ip), ''), 'unknown');
  select s.salt into v_salt from public.app_salt s limit 1;

  v_ok := public.check_rate('gstat:p:'  || v_p,  60,  interval '1 hour');
  if v_ok then v_ok := public.check_rate('gstat:ip:' || v_ip, 120, interval '1 hour'); end if;
  if v_ok and public.check_rate('gstat:ipn:' || v_ip || ':' || v_p, 1, interval '1 day') then
    v_ok := public.check_rate('gstat:ipd:' || v_ip, 20, interval '1 day');
  end if;

  if not v_ok then
    insert into public.phone_lookup_log (endpoint, phone_hash, ip_hash, result_count)
    values ('my-status', encode(extensions.digest(v_salt || v_p, 'sha256'), 'hex'),
            encode(extensions.digest(v_salt || v_ip, 'sha256'), 'hex'), -1);
    return;
  end if;

  return query
  select 'turn'::text, w.status::text, w.joined_at, w.party_size, w."position", r.name, r.slug
  from public.waitlist_entries w
  join public.customers c on c.id = w.customer_id
  join public.branches b on b.id = w.branch_id
  join public.restaurants r on r.id = b.restaurant_id
  where right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 9) = v_p
    and w.status in ('waiting','notified')
  union all
  select 'reservation'::text, rs.status::text, rs.reserved_at, rs.party_size, null::int, r.name, r.slug
  from public.reservations rs
  join public.customers c on c.id = rs.customer_id
  join public.branches b on b.id = rs.branch_id
  join public.restaurants r on r.id = b.restaurant_id
  where right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 9) = v_p
    and rs.status in ('pending','confirmed')
    and rs.reserved_at > now() - interval '1 hour'
  order by 3;

  get diagnostics v_n = row_count;
  insert into public.phone_lookup_log (endpoint, phone_hash, ip_hash, result_count)
  values ('my-status', encode(extensions.digest(v_salt || v_p, 'sha256'), 'hex'),
          encode(extensions.digest(v_salt || v_ip, 'sha256'), 'hex'), v_n);
end $fn$;

revoke execute on function public.guest_status_by_phone(text, text) from public, anon, authenticated;
grant execute on function public.guest_status_by_phone(text, text) to service_role;
