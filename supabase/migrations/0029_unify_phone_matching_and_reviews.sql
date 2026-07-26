-- توحيد مطابقة الأرقام (آخر ٩ خانات بعد تطبيع الأرقام العربية/الفارسية)
-- والتقييم المحروس: زيارة فعلية (إجلاس أو مسح) خلال ٧ أيام، بمعدّل محدود.

CREATE OR REPLACE FUNCTION public.norm_phone_input(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select right(regexp_replace(
    translate(coalesce(p,''),
      '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
      '01234567890123456789'),
    '\D', '', 'g'), 9);
$function$;

CREATE OR REPLACE FUNCTION public.submit_review(p_slug text, p_phone text, p_rating integer, p_comment text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_norm text; v_rid uuid; v_cid uuid; v_branch uuid; v_entry uuid; v_existing uuid;
begin
  v_norm := public.norm_phone_input(p_phone);
  if length(v_norm) <> 9 then
    return jsonb_build_object('ok', false, 'error', 'invalid_phone');
  end if;
  if not public.check_rate('review:p:' || v_norm, 5, interval '24 hours') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    return jsonb_build_object('ok', false, 'error', 'invalid_rating');
  end if;

  select r.id into v_rid from public.restaurants r where r.slug = p_slug and r.is_active;
  if v_rid is null then
    return jsonb_build_object('ok', false, 'error', 'restaurant_not_found');
  end if;

  select c.id into v_cid from public.customers c
  where right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 9) = v_norm
  order by c.created_at limit 1;
  if v_cid is null then
    return jsonb_build_object('ok', false, 'error', 'no_visit');
  end if;

  -- زيارة فعلية خلال ٧ أيام: إجلاس من الطابور أو تسجيل مسح
  select w.branch_id, w.id into v_branch, v_entry
  from public.waitlist_entries w
  join public.branches b on b.id = w.branch_id
  where w.customer_id = v_cid and b.restaurant_id = v_rid
    and w.status = 'seated' and w.seated_at > now() - interval '7 days'
  order by w.seated_at desc limit 1;

  if v_branch is null then
    select ci.branch_id into v_branch
    from public.checkins ci
    where ci.customer_id = v_cid and ci.restaurant_id = v_rid
      and ci.created_at > now() - interval '7 days'
    order by ci.created_at desc limit 1;
    if v_branch is null then
      return jsonb_build_object('ok', false, 'error', 'no_visit');
    end if;
  end if;

  select rv.id into v_existing from public.reviews rv
  where rv.restaurant_id = v_rid and rv.customer_id = v_cid limit 1;

  if v_existing is not null then
    update public.reviews
       set rating = p_rating,
           comment = nullif(left(btrim(coalesce(p_comment,'')), 500), ''),
           branch_id = v_branch,
           created_at = now()
     where id = v_existing;
  else
    insert into public.reviews (restaurant_id, branch_id, customer_id, waitlist_entry_id, rating, comment, is_published)
    values (v_rid, v_branch, v_cid, v_entry, p_rating,
            nullif(left(btrim(coalesce(p_comment,'')), 500), ''), true);
  end if;

  return jsonb_build_object('ok', true);
end $function$;
