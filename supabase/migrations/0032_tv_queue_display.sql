-- شاشة العرض: أسماء مقنّعة + ترتيب حيّ لليوم الحالي (بتوقيت الرياض) + خُدموا اليوم.

CREATE OR REPLACE FUNCTION public.tv_queue(p_branch_id uuid)
 RETURNS TABLE(rank integer, display_name text, status text, zone text, branch_name text, restaurant_name text, restaurant_slug text, restaurant_logo text, served_today integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with meta as (
    select b.name as bname, r.name as rname, r.slug as rslug, r.logo_url as rlogo,
           (select count(*)::int from public.waitlist_entries w2
             where w2.branch_id = b.id and w2.status = 'seated'
               and w2.seated_at >= (date_trunc('day', now() at time zone 'Asia/Riyadh') at time zone 'Asia/Riyadh')
           ) as served
    from public.branches b
    join public.restaurants r on r.id = b.restaurant_id
    where b.id = p_branch_id and b.is_active and r.is_active
  ),
  live as (
    select
      (row_number() over (partition by w.zone order by w."position"))::int as rnk,
      -- تقنيع الاسم: «محمد العتيبي» ← «محمد ع.»
      case
        when c.full_name is null or btrim(c.full_name) = '' then 'ضيف'
        when array_length(regexp_split_to_array(btrim(c.full_name), '\s+'), 1) > 1
          then split_part(btrim(c.full_name), ' ', 1) || ' ' ||
               left((regexp_split_to_array(btrim(c.full_name), '\s+'))[2], 1) || '.'
        else btrim(c.full_name)
      end as dname,
      w.status::text as st,
      w.zone
    from public.waitlist_entries w
    join public.customers c on c.id = w.customer_id
    where w.branch_id = p_branch_id
      and w.status in ('waiting','notified')
      and (w.joined_at at time zone 'Asia/Riyadh')::date
        = (now() at time zone 'Asia/Riyadh')::date
  )
  select live.rnk, live.dname, live.st, live.zone,
         meta.bname, meta.rname, meta.rslug, meta.rlogo, meta.served
  from meta left join live on true
  order by live.zone, live.rnk;
$function$;

grant execute on function public.tv_queue(uuid) to anon, authenticated;
