-- فاحص Supabase الأمني: branch_open_by_hours (من 0051) بلا search_path
-- مثبَّت — كل دوالنا الأخرى مثبّتة. دالة قراءة صرفة بلا وصول جداول،
-- فالخطر نظري، لكن القاعدة قاعدة: كل دالة تثبّت مسارها.
create or replace function public.branch_open_by_hours(p_hours jsonb, p_now timestamptz default now())
returns boolean language plpgsql stable set search_path to ''
as $function$
declare
  v_open time; v_close time; v_now time;
begin
  if p_hours is null or coalesce(btrim(p_hours->>'open'), '') = '' or coalesce(btrim(p_hours->>'close'), '') = '' then
    return true;
  end if;
  v_open := (p_hours->>'open')::time;
  v_close := (p_hours->>'close')::time;
  v_now := (p_now at time zone 'Asia/Riyadh')::time;
  if v_open = v_close then return true; end if;
  return case when v_open < v_close
    then v_now >= v_open and v_now < v_close
    else v_now >= v_open or v_now < v_close
  end;
exception when others then
  return true;
end;
$function$;
