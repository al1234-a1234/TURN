-- ============================================================================
--  اختُبِر حيًّا الليلة (مراجعة عدائية على turn-simulation): guest_status_by_phone
--  وrewards_by_phone كلٌّ منهما يفرض سقفه العلني الصحيح ٢٠ رقمًا مختلفًا لكل
--  IP يوميًّا — لكن كلٌّ منهما بمفتاح مستقلّ ('gstat:ipd:<ip>' مقابل
--  'rewards:ipd:<ip>')، فمن يريد تعداد أرقام جوّالٍ فعليّة يحصل على ٤٠
--  محاولةً يوميًّا لكلّ IP لا ٢٠ — ضِعف الميزانية المقصودة، رغم أنّ كلّ دالّةٍ
--  على حدة تعمل تمامًا كما صُمِّمت. هذا الترحيل **لا يغيّر أيّ سلوكٍ فورًا** —
--  فقط يُعرِّف الدالّتين بمفتاحٍ مشترك؛ تطبيقه يُوحِّد الميزانية إلى ٢٠ حقيقيّة.
--
--  ⚠️ غير مطبَّق — جاهزٌ للمراجعة والتطبيق لاحقًا، بعد انتهاء الخدمة الحيّة،
--  عبر المسار المعتاد (لا تطبيقٌ تلقائيّ من هذا الملفّ).
--
--  التغيير الوحيد: سطرا فحص الميزانية اليوميّة لكلّ IP ('...:ipd:') يستخدمان
--  الآن نفس المفتاح 'phone_lookup:ipd:<ip>' في كلتا الدالّتين — بقيّة
--  الحواجز (لكل رقمٍ بعينه لكل ساعة، ولكل IP بعامّة لكل ساعة، ومنع تكرار
--  نفس (IP، رقم) في نفس اليوم) تبقى كما هي بلا مساس.
-- ============================================================================

create or replace function public.guest_status_by_phone(p_phone text, p_ip text)
 returns table(kind text, status text, at timestamp with time zone, party_size integer, "position" integer, venue_name text, venue_slug text, id uuid)
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_p text; v_ip text; v_salt text; v_ok boolean; v_n integer := 0;
begin
  v_p := public.norm_phone_input(p_phone);
  if length(v_p) <> 9 then return; end if;
  v_ip := coalesce(nullif(btrim(p_ip), ''), 'unknown');
  select s.salt into v_salt from public.app_salt s limit 1;

  v_ok := public.check_rate('gstat:p:'  || v_p,  60,  interval '1 hour');
  if v_ok then v_ok := public.check_rate('gstat:ip:' || v_ip, 120, interval '1 hour'); end if;
  if v_ok and public.check_rate('gstat:ipn:' || v_ip || ':' || v_p, 1, interval '1 day') then
    v_ok := public.check_rate('phone_lookup:ipd:' || v_ip, 20, interval '1 day');
  end if;

  if not v_ok then
    insert into public.phone_lookup_log (endpoint, phone_hash, ip_hash, result_count)
    values ('my-status', encode(extensions.digest(v_salt || v_p, 'sha256'), 'hex'),
            encode(extensions.digest(v_salt || v_ip, 'sha256'), 'hex'), -1);
    return;
  end if;

  return query
  select 'turn'::text, w.status::text, w.joined_at, w.party_size, w."position", r.name, r.slug, w.id
  from public.waitlist_entries w
  join public.customers c on c.id = w.customer_id
  join public.branches b on b.id = w.branch_id
  join public.restaurants r on r.id = b.restaurant_id
  where right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 9) = v_p
    and w.status in ('waiting','notified')
  union all
  select 'reservation'::text, rs.status::text, rs.reserved_at, rs.party_size, null::int, r.name, r.slug, null::uuid
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
end $function$;

create or replace function public.rewards_by_phone(p_phone text, p_ip text)
 returns table(id uuid, kind text, title text, value numeric, value_kind text, description text, status text, armed_at timestamp with time zone, expires_at timestamp with time zone, redeemed_at timestamp with time zone, created_at timestamp with time zone)
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_p text; v_ip text; v_salt text; v_ok boolean; v_n integer := 0;
begin
  v_p := public.norm_phone_input(p_phone);
  if length(v_p) <> 9 then return; end if;
  v_ip := coalesce(nullif(btrim(p_ip), ''), 'unknown');
  select s.salt into v_salt from public.app_salt s limit 1;

  v_ok := public.check_rate('rewards:p:'  || v_p,  60,  interval '1 hour');
  if v_ok then v_ok := public.check_rate('rewards:ip:' || v_ip, 120, interval '1 hour'); end if;
  if v_ok and public.check_rate('rewards:ipn:' || v_ip || ':' || v_p, 1, interval '1 day') then
    v_ok := public.check_rate('phone_lookup:ipd:' || v_ip, 20, interval '1 day');
  end if;

  if not v_ok then
    insert into public.phone_lookup_log (endpoint, phone_hash, ip_hash, result_count)
    values ('my-rewards', encode(extensions.digest(v_salt || v_p, 'sha256'), 'hex'),
            encode(extensions.digest(v_salt || v_ip, 'sha256'), 'hex'), -1);
    return;
  end if;

  return query
  select cr.id, cr.kind, cr.title, cr.value, cr.value_kind, cr.description,
         cr.status, cr.armed_at, cr.expires_at, cr.redeemed_at, cr.created_at
  from public.customer_rewards cr
  join public.customers c on c.id = cr.customer_id
  where right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 9) = v_p
    and cr.status in ('active','redeemed')
    and (cr.status = 'redeemed' or cr.expires_at is null or cr.expires_at > now())
  order by (cr.status = 'active') desc, cr.armed_at desc nulls last, cr.created_at desc;

  get diagnostics v_n = row_count;
  insert into public.phone_lookup_log (endpoint, phone_hash, ip_hash, result_count)
  values ('my-rewards', encode(extensions.digest(v_salt || v_p, 'sha256'), 'hex'),
          encode(extensions.digest(v_salt || v_ip, 'sha256'), 'hex'), v_n);
end $function$;

-- المتوقَّع بعد التطبيق: محاولة ٢٠ رقمًا عبر my-status ثم أيّ محاولةٍ إضافية
-- عبر my-rewards من نفس الـIP تُحجَب فورًا — الميزانيتان تشتركان في نفس
-- العدّاد اليوميّ الآن، لا عدّادين منفصلين.
