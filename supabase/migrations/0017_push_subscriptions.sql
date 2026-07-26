-- ============================================================================
--  Web Push — اشتراكات إشعارات المتصفّح للعميل.
--  الهدف: يصل الإشعار والتطبيق مُغلق تمامًا (لا يكفي إشعار الصفحة المفتوحة).
--  الضيف غير مسجَّل دخول، فالوصول كله عبر دوال SECURITY DEFINER تتحقّق من
--  (معرّف الصف + رقم الجوّال) — نفس نمط waitlist_ticket_status.
-- ============================================================================

create table if not exists public.push_subscriptions (
  id           uuid primary key default uuid_generate_v4(),
  customer_id  uuid not null references public.customers(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists push_subscriptions_customer_idx
  on public.push_subscriptions (customer_id);

alter table public.push_subscriptions enable row level security;
-- لا سياسات مباشرة: كل الوصول عبر الدوال أدناه (SECURITY DEFINER).

-- ---------------------------------------------------------------------------
-- حفظ اشتراك العميل — يتحقّق أن الصف يخصّ صاحب هذا الرقم قبل الحفظ.
-- ---------------------------------------------------------------------------
create or replace function public.save_push_subscription(
  p_entry_id uuid,
  p_phone    text,
  p_endpoint text,
  p_p256dh   text,
  p_auth     text
) returns boolean
 language plpgsql
 volatile
 security definer
 set search_path to ''
as $function$
declare
  v_customer uuid;
begin
  if p_endpoint is null or length(p_endpoint) = 0 then
    return false;
  end if;

  select w.customer_id into v_customer
  from public.waitlist_entries w
  join public.customers c on c.id = w.customer_id
  where w.id = p_entry_id
    and c.phone = trim(p_phone);

  if v_customer is null then
    return false;   -- لا مطابقة: لا نكشف السبب
  end if;

  insert into public.push_subscriptions (customer_id, endpoint, p256dh, auth)
  values (v_customer, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set customer_id = excluded.customer_id,
        p256dh      = excluded.p256dh,
        auth        = excluded.auth;

  return true;
end;
$function$;

revoke all on function public.save_push_subscription(uuid, text, text, text, text) from public;
grant execute on function public.save_push_subscription(uuid, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- جلب اشتراكات عميلِ صفٍّ معيّن — للموظّف المخوّل في مطعم ذلك الفرع فقط.
-- ---------------------------------------------------------------------------
create or replace function public.push_subs_for_entry(p_entry_id uuid)
 returns table(endpoint text, p256dh text, auth text)
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select ps.endpoint, ps.p256dh, ps.auth
  from public.waitlist_entries w
  join public.push_subscriptions ps on ps.customer_id = w.customer_id
  where w.id = p_entry_id
    and public.is_staff_of(public.restaurant_of_branch(w.branch_id));
$function$;

revoke all on function public.push_subs_for_entry(uuid) from public;
grant execute on function public.push_subs_for_entry(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- حذف اشتراك ميّت (اختفى endpoint عند مزوّد الدفع) — للموظّف المخوّل.
-- ---------------------------------------------------------------------------
create or replace function public.delete_push_subscription(p_endpoint text)
 returns void
 language sql
 volatile
 security definer
 set search_path to ''
as $function$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$function$;

revoke all on function public.delete_push_subscription(text) from public;
grant execute on function public.delete_push_subscription(text) to authenticated;
