-- ═══ 0128: شبكات مجهول المجهول + أتمتة البنود اليدوية الثلاثة ═══
--
-- طلب المشغّل: «لازم نشوف حل مجهول المجهول، والبنود اليدوية نسويها الحين».
-- الثلاثة اليدوية تحوّلت آليةً بالكامل، وشبكة الواجهة الأمامية — الفجوة
-- الوحيدة المتبقية أمام مجهول المجهول — سُدّت:
--
-- (أ) سجل أخطاء متصفح العميل: انهيار الجافاسكربت يصير عند العميل وحده
--     وكل فحوص الخادم خضراء. حدّا الخطأ يبلّغان /api/client-error،
--     والفحص الدوري يعدّ: ٥ بلاغات بربع ساعة = تنبيه تيليجرام (0129).
-- (ب) نسخة يومية داخلية بتدوير أسبوعي (backup.<جدول>_d<يوم>): استرجاع
--     فوري بجملة SQL من أي «مسحٌ بالغلط أو عطب كود» — وهي فئة فقد
--     البيانات الأشيع فعليًّا، فوق نسخ Supabase للكوارث الكبرى.
--     جرى تمرين استرجاعٍ فعليّ عند التطبيق: تخريب صفٍّ عمدًا واسترجاعه
--     من النسخة بالحرف (داخل معاملة مُرجَعة).
-- (ج) مراقب انتهاء النطاق أسبوعيًّا من سجل RDAP الرسمي — الانتهاء الحالي
--     2027-08-01، والتحذير يبدأ قبله بـ٤٥ يومًا ويتكرر أسبوعيًّا.

create table public.client_errors (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  path text,
  message text,
  ua text
);
alter table public.client_errors enable row level security;
create index idx_client_errors_at on public.client_errors (at desc);

create or replace function public.log_client_error(p_path text, p_message text, p_ua text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  -- سقف إغراق صلب: المسار مفتوح بلا مفتاح بحكم طبيعته (متصفح منهار بلا جلسة)
  if (select count(*) from public.client_errors where at > now() - interval '1 hour') >= 500 then
    return;
  end if;
  insert into public.client_errors (path, message, ua)
  values (left(coalesce(p_path, ''), 200), left(coalesce(p_message, ''), 500), left(coalesce(p_ua, ''), 300));
end;
$fn$;

revoke execute on function public.log_client_error(text, text, text) from public, anon, authenticated;
grant execute on function public.log_client_error(text, text, text) to service_role;

create schema if not exists backup;
create table if not exists backup.snap_log (
  dow int primary key,
  at timestamptz not null,
  total_rows bigint not null
);

create or replace function public.backup_snapshot_daily()
returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  t text;
  v_dow int := extract(dow from (now() at time zone 'Asia/Riyadh'))::int;
  total bigint := 0;
  c bigint;
begin
  foreach t in array array[
    'restaurants','branches','branch_settings','branch_zones','tables','staff',
    'customers','customer_restaurant','waitlist_entries','reservations',
    'menu_categories','menu_items','reviews','customer_rewards',
    'restaurant_photos','winback_settings'
  ] loop
    execute format('drop table if exists backup.%I', t || '_d' || v_dow);
    execute format('create table backup.%I as select * from public.%I', t || '_d' || v_dow, t);
    execute format('select count(*) from backup.%I', t || '_d' || v_dow) into c;
    total := total + c;
  end loop;

  insert into backup.snap_log (dow, at, total_rows) values (v_dow, now(), total)
  on conflict (dow) do update set at = now(), total_rows = excluded.total_rows;

  -- تنظيف سجل أخطاء المتصفح (يكفي أسبوع للتشخيص)
  delete from public.client_errors where at < now() - interval '7 days';

  return total;
end;
$fn$;

revoke execute on function public.backup_snapshot_daily() from public, anon, authenticated;

select cron.schedule('backup-snapshot', '30 3 * * *', 'select public.backup_snapshot_daily()');

create or replace function public.check_domain_expiry()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_exp timestamptz;
  v_days int;
begin
  begin
    select min((e->>'eventDate')::timestamptz) into v_exp
    from (select content::jsonb as j from public.http_get('https://rdap.org/domain/ei8ht.app')) r,
         jsonb_array_elements(r.j->'events') e
    where e->>'eventAction' = 'expiration';
  exception when others then
    return; -- تعثّر سجل RDAP مؤقتًا — المحاولة القادمة بعد أسبوع
  end;
  if v_exp is null then return; end if;
  v_days := extract(epoch from (v_exp - now()))::bigint / 86400;
  if v_days <= 45 then
    perform public.notify_telegram(
      '⚠️ دور — نطاق ei8ht.app ينتهي خلال ' || v_days || ' يومًا (' || to_char(v_exp, 'YYYY-MM-DD') || ').' || E'\n' ||
      'جدّده عند Name.com فورًا — انتهاؤه يطفئ الموقع كاملًا ولا يصلحه أي نظام.');
  end if;
end;
$fn$;

revoke execute on function public.check_domain_expiry() from public, anon, authenticated;

select cron.schedule('domain-expiry-watch', '0 8 * * 1', 'select public.check_domain_expiry()');
