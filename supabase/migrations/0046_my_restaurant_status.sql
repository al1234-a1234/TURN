-- «وضعي مع هذا المطعم» — نداء واحد يرجع كل علاقة العميل بالمطعم:
-- زيارات، نقاط، طبقة، برنامج الولاء، وهداياه الفعّالة برموزها.
--
-- لماذا دالة جديدة بدل تركيب get_customer_rewards + get_customer_loyalty؟
-- تلك ترجعان كل المطاعم (شاشة «محفظتي»)، وهذه شاشة مطعم واحد يفتحها
-- الماسح مباشرة — نداء واحد أسرع، ولا يسرّب أسماء بقية المطاعم في سياق
-- لا يخصّها.
--
-- الحارس نفسه المعتمد في عائلة استعلامات الرقم: تحقّق بنية ثم حدّ معدّل
-- ٦٠/ساعة لكل رقم (كبح تعداد الأرقام، والاستخدام الشرعي بعيد عن الحد).
create or replace function public.my_restaurant_status(p_slug text, p_phone text)
returns jsonb
language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_norm text; v_rid uuid; v_cid uuid; v_row record; v_loy record; v_name text;
begin
  v_norm := public.norm_phone_input(p_phone);
  if length(v_norm) <> 9 then
    return jsonb_build_object('known', false);
  end if;
  if not public.check_rate('status:p:' || v_norm, 60, interval '1 hour') then
    return jsonb_build_object('known', false, 'error', 'rate_limited');
  end if;

  select r.id into v_rid from public.restaurants r
  where r.slug = p_slug and r.is_active limit 1;
  if v_rid is null then
    return jsonb_build_object('known', false);
  end if;

  select c.id, c.full_name into v_cid, v_name from public.customers c
  where right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 9) = v_norm
  order by c.created_at limit 1;
  if v_cid is null then
    return jsonb_build_object('known', false);
  end if;

  select visits, points, tier, last_visit into v_row
  from public.customer_restaurant
  where restaurant_id = v_rid and customer_id = v_cid;
  if v_row is null or coalesce(v_row.visits, 0) = 0 then
    -- رقم معروف في المنصّة لكنه لم يزر هذا المطعم: يُعامل كجديد هنا
    return jsonb_build_object('known', false);
  end if;

  select points_per_visit, reward_threshold, reward_description into v_loy
  from public.loyalty_programs where restaurant_id = v_rid and is_active;

  return jsonb_build_object(
    'known', true,
    'name', v_name,
    'visits', v_row.visits,
    'points', coalesce(v_row.points, 0),
    'tier', v_row.tier,
    'last_visit', v_row.last_visit,
    'loyalty', case when v_loy is null then null else jsonb_build_object(
      'points_per_visit', v_loy.points_per_visit,
      'threshold', v_loy.reward_threshold,
      'reward', v_loy.reward_description) end,
    'rewards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cr.id, 'kind', cr.kind, 'title', cr.title, 'value', cr.value,
        'value_kind', cr.value_kind, 'code', cr.code, 'expires_at', cr.expires_at,
        'description', cr.description) order by cr.created_at desc)
      from public.customer_rewards cr
      where cr.restaurant_id = v_rid and cr.customer_id = v_cid
        and cr.status = 'active'
        and (cr.expires_at is null or cr.expires_at > now())
    ), '[]'::jsonb));
end $function$;

revoke execute on function public.my_restaurant_status(text, text) from public;
grant execute on function public.my_restaurant_status(text, text) to anon, authenticated;
