-- ═══ تراجع ٠١٩٢ — إعادة امتداد http إلى مخطّط public ═══
--
-- يُطبَّق إن أخفق النقل أو ظهر ما لم يُتوقَّع. وهو **يعيد فتح CRITICAL-1
-- عمدًا**: بعده يعود public.http_get قابلًا للاستدعاء من دور anon عبر
-- PostgREST. ذلك مقصود — مراقبةٌ عاملةٌ مع ثغرةٍ معروفة أفضل من منصّةٍ
-- بلا مراقبة. ولا يُطبَّق إلّا بقرارٍ صريح.
--
-- الترتيب هنا معكوسُ ٠١٩٢ بالضبط: الامتداد أوّلًا ثمّ المراقبات، كلّه
-- في معاملةٍ واحدة. فإن سقطت خطوةٌ لم يبقَ نصفُ حالة.

-- ١) الامتداد يعود إلى public
drop extension http;
create extension http schema public;

-- ٢) المراقبات الثلاث تعود إلى public.http*
do $rb$
declare r record; d text; d2 text; v_done text := '';
begin
  for r in select unnest(array['check_platform_health','check_visual_integrity','check_domain_expiry']) as fname
  loop
    select pg_get_functiondef(oid) into d from pg_proc
     where proname = r.fname and pronamespace='public'::regnamespace;
    if d is null then raise exception 'الدالّة % غير موجودة', r.fname; end if;

    d2 := replace(d, 'extensions.http', 'public.http');
    if d2 = d then raise exception 'لا مرجعَ extensions.http في % — الحالة ليست ما خلّفه ٠١٩٢', r.fname; end if;
    execute d2;
    v_done := v_done || r.fname || '، ';
  end loop;
  raise notice 'أُعيدت: %', v_done;
end $rb$;

-- ٣) q20 يعود إلى ١٥٩ (١٤٠ + ١٩ دالّةً للامتداد في public)
do $rb2$
declare d text; d2 text;
begin
  select pg_get_functiondef(oid) into d from pg_proc
   where proname='run_critical_checks' and pronamespace='public'::regnamespace;
  d2 := replace(d, 'and p.prokind=''f'') = 140', 'and p.prokind=''f'') = 159');
  if d2 = d then raise exception 'مرساة عدّاد الدوالّ (140) لم تُطابق'; end if;
  execute d2;
end $rb2$;

-- ٤) إزالة الحارس w56 — بحذف النصّ نفسه الذي أدخله ٠١٩٢
do $rb3$
declare d text; d2 text; v_old text;
begin
  select pg_get_functiondef(oid) into d from pg_proc
   where proname='run_critical_checks' and pronamespace='public'::regnamespace;

  v_old :=
       E'    (''w56_http_ext_outside_public'',\n'
    || E'       not exists (select 1 from pg_depend dp\n'
    || E'                     join pg_extension ex on ex.oid = dp.refobjid and ex.extname = ''http''\n'
    || E'                     join pg_proc pr on pr.oid = dp.objid\n'
    || E'                     join pg_namespace ns on ns.oid = pr.pronamespace\n'
    || E'                    where dp.refclassid = ''pg_extension''::regclass\n'
    || E'                      and dp.classid = ''pg_proc''::regclass\n'
    || E'                      and ns.nspname = ''public'')\n'
    || E'       and not exists (select 1 from pg_proc pr\n'
    || E'                        where pr.pronamespace = ''public''::regnamespace\n'
    || E'                          and pr.proname in (''check_platform_health'',''check_visual_integrity'',\n'
    || E'                                             ''check_domain_expiry'')\n'
    || E'                          and position(''public.http'' in pg_get_functiondef(pr.oid)) > 0)),\n';

  d2 := replace(d, v_old, '');
  if d2 = d then raise exception 'مرساة w56 لم تُطابق'; end if;
  execute d2;
end $rb3$;

-- ٥) تحقّقٌ بعديّ: المراقبات تعمل، ولا فحصَ راسب
do $verify$
declare v_fail text; v_w56 int; v_h jsonb; v_pub int;
begin
  select count(*) into v_w56 from public.run_critical_checks()
   where name = 'w56_http_ext_outside_public';
  if v_w56 <> 0 then raise exception 'w56 ما زال موجودًا بعد التراجع'; end if;

  select count(*) into v_pub from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname = 'http_get';
  if v_pub = 0 then raise exception 'public.http_get لم تعد — التراجع لم يكتمل'; end if;

  v_h := public.check_platform_health();
  if (v_h->'homepage'->>'ok')::boolean is not true then
    raise exception 'مسبار الصفحة الرئيسيّة راسبٌ بعد التراجع: %', (v_h->'homepage')::text;
  end if;

  select coalesce(string_agg(name,'، ') filter (where not pass),'—') into v_fail
    from public.run_critical_checks();
  if v_fail <> '—' then raise exception 'فحوصٌ راسبة بعد التراجع: %', v_fail; end if;
end
$verify$;
