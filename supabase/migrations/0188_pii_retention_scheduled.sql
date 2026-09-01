-- ═══ المهمّة ٢ — استبقاء بيانات الضيوف (HIGH §١٠، فجوة PDPL) ═══
--
-- ١٣٩٤ ضيفًا بأسمائهم وجوّالاتهم محفوظون بلا أجل. run_retention() تغطّي
-- owner_insights و push_subscriptions فقط، وretire_dormant_customers
-- وretire_phone_lookup_log ليستا في أيٍّ من العشرين وظيفة cron.
--
-- ══ عطلٌ اكتُشف أثناء التنفيذ — وهو سبب عدم جدولة الدالّة القائمة ══
-- `retire_dormant_customers` تضع `full_name = null`، و`customers.full_name`
-- عمودٌ NOT NULL. فهي تسقط بـ23502 عند أوّل صفٍّ تحاول إخماله — أي أنّها
-- **لم تعمل قطّ**. ولو جُدولت كما هي لفشلت كلّ ليلة، وفشلُ cron لا يظهر
-- إلا في cron.job_run_details التي لا يقرؤها أحد. مُثبَتٌ على المحاكاة
-- بالخطأ الحرفيّ قبل هذا الترحيل.
--
-- فالإخمال هنا يضع '' لا NULL: يُرضي القيد ولا يحمل بيانةً شخصيّة.
--
-- ══ لماذا دالّةٌ ثانية لا إرخاء حارس القائمة ══
-- retire_dormant_customers محروسة بـ is_platform_admin()، وهذه تسقط تحت
-- cron: لا JWT ⇒ auth.uid() فارغة ⇒ false ⇒ 'not authorized' كلّ تشغيل
-- (مُثبَتٌ على الإنتاج: admin_check_now = false). وإرخاء الحارس بـ«أو
-- auth.uid() فارغة» يشمل anon أيضًا، فيصير مسارٌ متلِفٌ محروسًا بالمنح
-- وحده — وهو النمط الذي عيّبناه في LOW-1. فمسارٌ ثانٍ مغلقٌ على cron أسلم.
--
-- ══ النافذة المختارة: ٢٤ شهرًا ══
-- الضيف يُخمَل بعد سنتين بلا دورٍ ولا حجزٍ ولا هديّةٍ فعّالة. أقصر من ذلك
-- يضرب ميزة العائد (visits، والاسترجاع عند ٩٠ يومًا)، وأطول يخالف مبدأ
-- التقليل في PDPL. وسجلّ الاستعلامات ٣٠ يومًا (سجلّ أمنيّ لا سجلّ عمل).
-- والأثر اليوم: صفر — أقدم عميلٍ في القاعدة ٢٠٢٦-٠٧-٢٠، وأقدم استعلامٍ
-- ٢٠٢٦-٠٨-١٣. هذه جدولةٌ تستبق لا تحذف.
--
-- الإخمال لا يحذف صفًّا: يُبقي العلاقات كلّها سليمة (طابور، حجوزات،
-- إحصاءات) ويمحو ما يدلّ على الشخص وحده. مُثبَتٌ على المحاكاة بأربع حالات.
--
-- التراجع: 0189_ROLLBACK_pii_retention.sql

create or replace function public.run_pii_retention()
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_cust int; v_log int; v_months constant int := 24;
begin
  update public.customers c
     set full_name = '', email = null,
         phone = 'retired:' || substr(md5(coalesce(c.phone,'') || c.id::text), 1, 12)
   where c.user_id is null
     and coalesce(c.phone,'') not like 'retired:%'
     and not exists (select 1 from public.waitlist_entries w
                      where w.customer_id = c.id
                        and w.joined_at > now() - make_interval(months => v_months))
     and not exists (select 1 from public.reservations r
                      where r.customer_id = c.id
                        and r.created_at > now() - make_interval(months => v_months))
     and not exists (select 1 from public.customer_rewards cr
                      where cr.customer_id = c.id and cr.status = 'active')
     and c.created_at < now() - make_interval(months => v_months);
  get diagnostics v_cust = row_count;

  v_log := public.retire_phone_lookup_log();

  return jsonb_build_object('customers_retired', v_cust, 'lookups_pruned', v_log);
end $function$;

revoke all on function public.run_pii_retention() from public, anon, authenticated;

comment on function public.run_pii_retention() is
  'استبقاء البيانات الشخصيّة: إخمال ضيوفٍ خاملين ٢٤ شهرًا (لا حذف) + تقليم سجلّ الاستعلامات ٣٠ يومًا. مدخل cron وحده.';

-- إصلاح الدالّة اليدويّة كي لا تبقى لغمًا لمن يستدعيها من لوحة الإدارة
create or replace function public.retire_dormant_customers(p_months integer default 24)
 returns integer language plpgsql security definer set search_path to ''
as $function$
declare n int; v_months int;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  v_months := greatest(coalesce(p_months, 24), 6);
  update public.customers c
     set full_name = '', email = null,
         phone = 'retired:' || substr(md5(coalesce(c.phone,'') || c.id::text), 1, 12)
   where c.user_id is null
     and coalesce(c.phone,'') not like 'retired:%'
     and not exists (select 1 from public.waitlist_entries w
                      where w.customer_id = c.id
                        and w.joined_at > now() - make_interval(months => v_months))
     and not exists (select 1 from public.reservations r
                      where r.customer_id = c.id
                        and r.created_at > now() - make_interval(months => v_months))
     and not exists (select 1 from public.customer_rewards cr
                      where cr.customer_id = c.id and cr.status = 'active')
     and c.created_at < now() - make_interval(months => v_months);
  get diagnostics n = row_count;
  return n;
end $function$;

-- الجدولة: ٠٣:٤٥ UTC يوميًّا — بين prune-queue-events (٠٣:٢٠) والتقرير (٠٤:٠٠)
select cron.unschedule('pii-retention')
 where exists (select 1 from cron.job where jobname = 'pii-retention');
select cron.schedule('pii-retention', '45 3 * * *', $$select public.run_pii_retention();$$);

-- q20: دالّةٌ واحدة جديدة  158 → 159
do $mig$
declare d text; d2 text;
begin
  select pg_get_functiondef(oid) into d from pg_proc
   where proname='run_critical_checks' and pronamespace='public'::regnamespace;
  d2 := replace(d, 'and p.prokind=''f'') = 158', 'and p.prokind=''f'') = 159');
  if d2 = d then raise exception 'مرساة عدّاد الدوالّ (158) لم تُطابق'; end if;
  execute d2;
end $mig$;

-- حارسٌ دائم w54: الاستبقاء مجدولٌ، والإخمال لا يضع NULL في عمودٍ NOT NULL
do $mig2$
declare d text; d2 text; v_new text;
begin
  select pg_get_functiondef(oid) into d from pg_proc
   where proname='run_critical_checks' and pronamespace='public'::regnamespace;
  v_new :=
       E'    (''w54_pii_retention_scheduled'',\n'
    || E'       exists (select 1 from cron.job where jobname = ''pii-retention'' and active)\n'
    || E'       and (select pg_get_functiondef(oid) !~ ''full_name = null''\n'
    || E'              from pg_proc where proname=''run_pii_retention''\n'
    || E'               and pronamespace=''public''::regnamespace)\n'
    || E'       and (select pg_get_functiondef(oid) !~ ''full_name = null''\n'
    || E'              from pg_proc where proname=''retire_dormant_customers''\n'
    || E'               and pronamespace=''public''::regnamespace)),\n';
  d2 := replace(d, E'    (''q20_schema_no_drift'',', v_new || E'    (''q20_schema_no_drift'',');
  if d2 = d then raise exception 'مرساة q20 لم تُطابق'; end if;
  execute d2;
end $mig2$;

do $verify$
declare v_fail text; v_w54 boolean;
begin
  select coalesce(string_agg(name,'، ') filter (where not pass),'—') into v_fail
    from public.run_critical_checks();
  select pass into v_w54 from public.run_critical_checks() where name='w54_pii_retention_scheduled';
  if v_w54 is null then raise exception 'w54 لم يُضف'; end if;
  if not v_w54 then raise exception 'w54 راسب فور إضافته'; end if;
  if v_fail <> '—' then raise exception 'فحوصٌ راسبة: %', v_fail; end if;
end
$verify$;