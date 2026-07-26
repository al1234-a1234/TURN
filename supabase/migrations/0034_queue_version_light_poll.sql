-- نبضة خفيفة للاستقبال: نسخة الطابور (آخر تعديل + العدد) بدل إعادة ريندر كامل.

CREATE OR REPLACE FUNCTION public.queue_version(p_branch_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(max(w.updated_at)::text, 'empty') || ':' || count(*)::text
  from public.waitlist_entries w
  where w.branch_id = p_branch_id
    and w.status in ('waiting','notified');
$function$;
grant execute on function public.queue_version(uuid) to anon, authenticated;
