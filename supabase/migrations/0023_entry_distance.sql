-- ============================================================================
--  مسافة العميل عن الفرع وقت أخذ الدور.
--  الغرض: منع الحجز الوهمي من بعيد (أحدهم في الرياض يحجز في بريدة)، وإظهار
--  «يبعد كذا» للاستقبال ليقدّر متى يُجلسه.
--
--  خصوصية: لا نخزّن إحداثيات العميل إطلاقًا — تُرسَل مرّة، تُحسب المسافة على
--  الخادم مقابل إحداثيات الفرع، ويُحفظ الرقم بالمتر فقط.
--
--  الحارس: لا تُضبط المسافة إلا لصفٍّ حيٍّ أُنشئ خلال دقيقتين — فلا تُزوَّر لاحقًا،
--  ولا تُكتب أكثر من مرة (distance_m is null).
-- ============================================================================

alter table public.waitlist_entries
  add column if not exists distance_m integer;

create or replace function public.set_entry_distance(
  p_entry_id uuid,
  p_lat      double precision,
  p_lng      double precision
) returns boolean
 language plpgsql
 volatile
 security definer
 set search_path to ''
as $function$
declare
  v_blat double precision;
  v_blng double precision;
  v_dist integer;
begin
  if p_lat is null or p_lng is null
     or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    return false;
  end if;

  select b.lat, b.lng into v_blat, v_blng
  from public.waitlist_entries w
  join public.branches b on b.id = w.branch_id
  where w.id = p_entry_id
    and w.status in ('waiting','notified')
    and w.distance_m is null
    and w.joined_at > now() - interval '2 minutes';

  if v_blat is null or v_blng is null then
    return false;   -- الفرع بلا إحداثيات: لا مسافة تُحسب
  end if;

  -- هافرساين (نصف قطر الأرض 6371000 م)
  v_dist := round(
    6371000 * 2 * asin(sqrt(
      power(sin(radians(p_lat - v_blat) / 2), 2) +
      cos(radians(v_blat)) * cos(radians(p_lat)) *
      power(sin(radians(p_lng - v_blng) / 2), 2)
    ))
  );

  update public.waitlist_entries
     set distance_m = v_dist
   where id = p_entry_id and distance_m is null;

  return true;
end;
$function$;

revoke all on function public.set_entry_distance(uuid, double precision, double precision) from public;
grant execute on function public.set_entry_distance(uuid, double precision, double precision) to anon, authenticated;
