-- ═══ تراجع ٠١٩٠ — إعادة هاتف الطُّعم إلى دقّة الثانية ═══
--
-- يُطبَّق فقط إن أظهر ٠١٩٠ عطلًا غير متوقَّع. وهو يعيد العطل المعروف
-- (إنذار ٠٤:٠٠ الكاذب) — فلا يُطبَّق إلّا لأنّ ما بعده أسوأ.
--
-- كلا الاستبدالين مرتكزٌ على النصّ الذي كتبه ٠١٩٠ حرفيًّا، لا بتعبيرٍ
-- نمطيّ. فإن لم يُطابق فالحالة ليست ما خلّفه ٠١٩٠، والرجوعُ الأعمى
-- عندها أخطر من التوقّف: يرفع استثناءً بدل أن يخمّن.

do $rb$
declare d text; d2 text;
begin
  select pg_get_functiondef(oid) into d from pg_proc
   where proname='check_platform_health' and pronamespace='public'::regnamespace;
  if d is null then raise exception 'check_platform_health غير موجودة'; end if;

  d2 := replace(d,
    '''05'' || lpad(floor(random() * 100000000)::bigint::text, 8, ''0'')',
    '''05'' || lpad((extract(epoch from clock_timestamp())::bigint % 100000000)::text, 8, ''0'')');
  if d2 = d then raise exception 'مرساة هاتف الطُّعم الجديد لم تُطابق — لا تراجعَ أعمى'; end if;
  execute d2;
end $rb$;

-- إزالة الحارس w55 (وإلّا رسب فورًا بعد التراجع) — بحذف النصّ نفسه الذي أدخله ٠١٩٠
do $rb2$
declare d text; d2 text; v_old text;
begin
  select pg_get_functiondef(oid) into d from pg_proc
   where proname='run_critical_checks' and pronamespace='public'::regnamespace;

  v_old :=
       E'    (''w55_health_canary_phone_subsecond'',\n'
    || E'       (select position(''lpad(floor(random() * 100000000)'' in pg_get_functiondef(oid)) > 0\n'
    || E'           and position(''(extract(epoch from clock_timestamp())::bigint'' in pg_get_functiondef(oid)) = 0\n'
    || E'          from pg_proc where proname=''check_platform_health''\n'
    || E'           and pronamespace=''public''::regnamespace)),\n';

  d2 := replace(d, v_old, '');
  if d2 = d then raise exception 'مرساة w55 لم تُطابق'; end if;
  execute d2;
end $rb2$;

do $verify$
declare v_fail text; v_w55 int;
begin
  select count(*) into v_w55 from public.run_critical_checks()
   where name = 'w55_health_canary_phone_subsecond';
  if v_w55 <> 0 then raise exception 'w55 ما زال موجودًا بعد التراجع'; end if;
  select coalesce(string_agg(name,'، ') filter (where not pass),'—') into v_fail
    from public.run_critical_checks();
  if v_fail <> '—' then raise exception 'فحوصٌ راسبة بعد التراجع: %', v_fail; end if;
end
$verify$;
