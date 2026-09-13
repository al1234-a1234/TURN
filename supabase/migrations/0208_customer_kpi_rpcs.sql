-- إجماليات العملاء (اللوحة الرئيسية + صفحة العملاء) كانت تُحسب عبر HEAD
-- count(exact) مباشرةً على customer_restaurant من العميل — فتمرّ بسياسة RLS
-- التي تستدعي staff_has_perm(restaurant_id, 'customers') **لكل صفٍّ** لأن
-- الوسيط عمودٌ من الصفّ لا ثابتًا يعرفه المخطِّط. لمطعمٍ بحجم Eficto
-- (١٢,٣١٧ صفًّا) هذا يعني ١٢,٣١٧ استدعاءً للدالة على كل عدٍّ — قسته فعليًّا:
-- ٥.٣ ثانية لعدٍّ واحد (EXPLAIN ANALYZE بهويّة staff حقيقية)، فيتجاوز مهلة
-- الاستضافة ويرجع 500، فتقرأ لوحة المالك «صفر عملاء» رغم صحّة البيانات كاملةً.
--
-- الحل هنا مطابقٌ لنمط customer_segments_with_counts القائم: دالّتان
-- SECURITY DEFINER (تتجاوزان RLS كمالك الجدول postgres، والجدول ليس
-- FORCE ROW LEVEL SECURITY) تفحصان الصلاحية مرّةً واحدة بوسيطٍ ثابتٍ
-- (p_restaurant_id، لا عمود صفّ) فيعامله المخطِّط ثابتًا لا استدعاءً متكرّرًا.

create or replace function public.dashboard_customer_kpis(p_restaurant_id uuid)
returns table (total bigint, returning_customers bigint, vip bigint)
language sql
stable security definer
set search_path to ''
as $function$
  select
    count(*),
    count(*) filter (where visits >= 2),
    count(*) filter (where is_vip)
  from public.customer_restaurant
  where restaurant_id = p_restaurant_id
    and (public.staff_has_perm(p_restaurant_id, 'customers') or public.is_platform_admin());
$function$;

revoke all on function public.dashboard_customer_kpis(uuid) from public, anon;
grant execute on function public.dashboard_customer_kpis(uuid) to authenticated;

create or replace function public.customers_page_counts(p_restaurant_id uuid, p_dormant_since timestamptz)
returns table (all_count bigint, vip_count bigint, returning_count bigint, new_count bigint, dormant_count bigint)
language sql
stable security definer
set search_path to ''
as $function$
  select
    count(*),
    count(*) filter (where not is_blocked and is_vip),
    count(*) filter (where not is_blocked and visits >= 2),
    count(*) filter (where not is_blocked and visits <= 1),
    count(*) filter (where not is_blocked and last_visit < p_dormant_since)
  from public.customer_restaurant
  where restaurant_id = p_restaurant_id
    and (public.staff_has_perm(p_restaurant_id, 'customers') or public.is_platform_admin());
$function$;

revoke all on function public.customers_page_counts(uuid, timestamptz) from public, anon;
grant execute on function public.customers_page_counts(uuid, timestamptz) to authenticated;
