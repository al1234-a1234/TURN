-- ═══ تراجع ٠١٩٤ — إيقاف تنظيف أثر الطُّعم ═══
--
-- ⚠ تنبيهٌ صريح: هذا التراجع **لا يُعيد الصفوف المحذوفة**. حذفُ صفوف
-- «فحص آلي» نهائيّ. وهو مقبولٌ لأنّها ليست بيانةَ أحد: اسمٌ ثابتٌ يكتبه
-- المسبار، وهاتفٌ عشوائيّ لا يخصّ شخصًا، وصفرُ ارتباطٍ بطابورٍ أو حجز
-- (شرطٌ في الحذف نفسه لا افتراض). فالذي يُعاد هنا هو **السلوك** وحده:
-- تتوقّف الجدولة، وتزول الدالّة والحارس.
--
-- يُطبَّق إن تبيّن أنّ التنظيف يحذف ما لا ينبغي — وعندها الأولويّة إيقافُ
-- النزف لا استرجاعُ ما مضى.

select cron.unschedule('prune-canary-artifacts')
 where exists (select 1 from cron.job where jobname = 'prune-canary-artifacts');

drop function if exists public.prune_canary_artifacts();

-- q20: دالّةٌ زالت  141 → 140
do $rb$
declare d text; d2 text;
begin
  select pg_get_functiondef(oid) into d from pg_proc
   where proname='run_critical_checks' and pronamespace='public'::regnamespace;
  d2 := replace(d, 'and p.prokind=''f'') = 141', 'and p.prokind=''f'') = 140');
  if d2 = d then raise exception 'مرساة عدّاد الدوالّ (141) لم تُطابق'; end if;
  execute d2;
end $rb$;

-- إزالة الحارس w57 — بحذف النصّ نفسه الذي أدخله ٠١٩٤
do $rb2$
declare d text; d2 text; v_old text;
begin
  select pg_get_functiondef(oid) into d from pg_proc
   where proname='run_critical_checks' and pronamespace='public'::regnamespace;

  v_old :=
       E'    (''w57_canary_artifacts_bounded'',\n'
    || E'       exists (select 1 from cron.job where jobname = ''prune-canary-artifacts'' and active)\n'
    || E'       and (select count(*) from public.customers\n'
    || E'             where full_name = ''فحص آلي'' and user_id is null) <= 300),\n';

  d2 := replace(d, v_old, '');
  if d2 = d then raise exception 'مرساة w57 لم تُطابق'; end if;
  execute d2;
end $rb2$;

do $verify$
declare v_fail text; v_w57 int; v_fn int; v_job int;
begin
  select count(*) into v_w57 from public.run_critical_checks()
   where name = 'w57_canary_artifacts_bounded';
  if v_w57 <> 0 then raise exception 'w57 ما زال موجودًا بعد التراجع'; end if;

  select count(*) into v_fn from pg_proc
   where proname='prune_canary_artifacts' and pronamespace='public'::regnamespace;
  if v_fn <> 0 then raise exception 'الدالّة لم تُحذف'; end if;

  select count(*) into v_job from cron.job where jobname='prune-canary-artifacts';
  if v_job <> 0 then raise exception 'الوظيفة المجدولة لم تُلغَ'; end if;

  select coalesce(string_agg(name,'، ') filter (where not pass),'—') into v_fail
    from public.run_critical_checks();
  if v_fail <> '—' then raise exception 'فحوصٌ راسبة بعد التراجع: %', v_fail; end if;
end
$verify$;
