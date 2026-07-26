-- حدّ المعدّل داخل القاعدة لدوال الضيف.
-- المفتاحان: الرقم (إساءة الفرد) والفرع (إغراق الأرقام العشوائية) — لا IP لأن
-- كل الطلبات تمرّ من خادم Next بعناوين Vercel نفسها فتُخنق معًا.
-- rate_limits بلا سياسات (RLS مفعّل = ممنوع مباشرة): تُستدعى فقط من دوال DEFINER.

create table if not exists public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 0
);
alter table public.rate_limits enable row level security;

CREATE OR REPLACE FUNCTION public.check_rate(p_key text, p_max integer, p_window interval)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_ok boolean;
begin
  insert into public.rate_limits as rl (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update set
    count        = case when rl.window_start < now() - p_window then 1 else rl.count + 1 end,
    window_start = case when rl.window_start < now() - p_window then now() else rl.window_start end
  returning rl.count <= p_max into v_ok;

  -- تنظيف انتهازي خفيف للنوافذ الميّتة القديمة
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '2 days';
  end if;

  return v_ok;
end $function$;

-- حدود join_waitlist_guest (3/١٠د للرقم + 30/د للفرع) مدمجة في تعريف الدالة
-- الأحدث في 0042_riyadh_day_truth_and_counters.sql، وحدود submit_review في 0029.
