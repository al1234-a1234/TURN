-- ═══════════════════════════════════════════════════════════════
-- ٠١٤٤ — تركيب فحوص مهلة الإغلاق والسقف (توثيقُ واقعٍ قائم)
-- ═══════════════════════════════════════════════════════════════
--
-- ⚠ إعادةُ بناءٍ من الحالة الحيّة على الإنتاج (٣١ أغسطس ٢٠٢٦)، لا النصّ
--   الأصليّ. مطبَّقٌ فعلًا باسم `wire_hours_grace_checks`
--   (version 20260829181130) — **بلا رقمٍ في سجلّ الإنتاج**، وأعطيتُه ٠١٤٤
--   لأنّه الموضع الشاغر الوحيد بين ٠١٤٣ و٠١٤٥ وترتيبُه الزمنيّ يقع بينهما
--   تمامًا. الرقم اجتهادٌ منّي؛ الاسم كما هو في الإنتاج.
--
-- خمسة فحوصٍ موجودةٌ حيًّا وغائبةٌ عن المستودع، مستخرجةٌ حرفيًّا من
-- التعريف الحيّ. أهمّها `w22_hours_close_grace` — وهو الفحص الذي كان
-- سيكشف محوَ مهلة الـ٩٠ دقيقة لو حدث.

do $mig$
declare d text; d2 text;
begin
  select pg_get_functiondef(p.oid) into d
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'run_critical_checks';

  if d is null then
    raise notice '٠١٤٤: run_critical_checks غير موجودة — تُخطّى.';
    return;
  end if;

  if position('w22_hours_close_grace' in d) > 0 then
    raise notice '٠١٤٤: الفحوص مركَّبة أصلًا — لا تكرار.';
    return;
  end if;

  d2 := replace(
    d,
    $srch$
  )
  select name, pass from checks;$srch$,
    $repl$,
    ('w22_hours_close_grace',      (select pg_get_functiondef(oid) like '%branch_open_by_hours(s.opening_hours, now() - interval%'
                                    from pg_proc where proname='expire_stale_waitlist')),
    ('w22_closed_waiters_locked',  (not has_function_privilege('anon','public.alert_closed_branch_with_waiters()','EXECUTE')
                                   and not has_function_privilege('authenticated','public.alert_closed_branch_with_waiters()','EXECUTE'))),
    ('w22_closed_waiters_cron_alive', (select schedule = '*/5 * * * *' and active
                                        from cron.job where jobname='closed-branch-waiters')),
    ('w22_cap_default_present',    (select column_default = '50' from information_schema.columns
                                    where table_schema='public' and table_name='branch_settings'
                                      and column_name='max_waitlist_size')),
    ('w22_no_active_branch_uncapped', not exists(
                                    select 1 from public.branches b
                                    join public.branch_settings s on s.branch_id = b.id
                                   where b.is_active and s.max_waitlist_size is null))
  )
  select name, pass from checks;$repl$);

  if d2 = d then
    raise exception '٠١٤٤: المرساة لم تُطابق — توقّف قبل أن أكسر شبكة الفحوص.';
  end if;
  execute d2;
end
$mig$;
