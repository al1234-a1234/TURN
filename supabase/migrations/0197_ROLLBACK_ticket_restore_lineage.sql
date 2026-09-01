-- ═══ تراجع ٠١٩٦ — عودة التذكرة إلى القراءة بالمُعرّف المباشر ═══
--
-- ⚠ هذا التراجع **يعيد العطل**: من أُرجع دورُه يعود فيرى «تم إلغاء دورك»
-- في تذكرته إلى الأبد. لا يُطبَّق إلّا إن تبيّن أنّ تتبّع النسب يُظهر
-- لضيفٍ صفًّا ليس صفَّه — وعندها الخطأ الصامت أهون من الخطأ الخاطئ.
--
-- الترتيب معكوس ٠١٩٦: الدالّتان أوّلًا (كي لا تبقيا تناديان دالّةً تزول)
-- ثمّ الحارس ثمّ الدالّة والفهرس.

do $rb$
declare r record; d text; d2 text;
begin
  for r in select unnest(array['waitlist_ticket_by_id','waitlist_ticket_status']) as fname
  loop
    select pg_get_functiondef(oid) into d from pg_proc
     where proname = r.fname and pronamespace='public'::regnamespace;
    if d is null then raise exception 'الدالّة % غير موجودة', r.fname; end if;

    d2 := replace(d, 'where w.id = public.effective_entry_id(p_entry_id)', 'where w.id = p_entry_id');
    if d2 = d then raise exception 'مرساة % لم تُطابق — الحالة ليست ما خلّفه ٠١٩٦', r.fname; end if;
    execute d2;
  end loop;
end $rb$;

-- إزالة الحارس w58 — بحذف النصّ نفسه الذي أدخله ٠١٩٦
do $rb2$
declare d text; d2 text; v_old text;
begin
  select pg_get_functiondef(oid) into d from pg_proc
   where proname='run_critical_checks' and pronamespace='public'::regnamespace;

  v_old :=
       E'    (''w58_ticket_follows_restore_lineage'',\n'
    || E'       (select count(*) = 2 from pg_proc pr\n'
    || E'         where pr.pronamespace = ''public''::regnamespace\n'
    || E'           and pr.proname in (''waitlist_ticket_by_id'',''waitlist_ticket_status'')\n'
    || E'           and position(''effective_entry_id'' in pg_get_functiondef(pr.oid)) > 0)\n'
    || E'       and not exists (\n'
    || E'         select 1 from public.queue_events ev\n'
    || E'          where ev.kind = ''restored'' and ev.detail ? ''restored_from''\n'
    || E'            and public.effective_entry_id((ev.detail->>''restored_from'')::uuid)::text\n'
    || E'                = ev.detail->>''restored_from'')),\n';

  d2 := replace(d, v_old, '');
  if d2 = d then raise exception 'مرساة w58 لم تُطابق'; end if;
  execute d2;
end $rb2$;

drop index if exists public.queue_events_restored_from_idx;
drop function if exists public.effective_entry_id(uuid);

-- q20: دالّةٌ زالت  142 → 141
do $rb3$
declare d text; d2 text;
begin
  select pg_get_functiondef(oid) into d from pg_proc
   where proname='run_critical_checks' and pronamespace='public'::regnamespace;
  d2 := replace(d, 'and p.prokind=''f'') = 142', 'and p.prokind=''f'') = 141');
  if d2 = d then raise exception 'مرساة عدّاد الدوالّ (142) لم تُطابق'; end if;
  execute d2;
end $rb3$;

do $verify$
declare v_fail text; v_w58 int; v_fn int;
begin
  select count(*) into v_w58 from public.run_critical_checks()
   where name='w58_ticket_follows_restore_lineage';
  if v_w58 <> 0 then raise exception 'w58 ما زال موجودًا بعد التراجع'; end if;

  select count(*) into v_fn from pg_proc
   where proname='effective_entry_id' and pronamespace='public'::regnamespace;
  if v_fn <> 0 then raise exception 'الدالّة لم تُحذف'; end if;

  select coalesce(string_agg(name,'، ') filter (where not pass),'—') into v_fail
    from public.run_critical_checks();
  if v_fail <> '—' then raise exception 'فحوصٌ راسبة بعد التراجع: %', v_fail; end if;
end
$verify$;
