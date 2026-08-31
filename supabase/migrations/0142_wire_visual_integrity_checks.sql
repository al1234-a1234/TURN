-- ═══════════════════════════════════════════════════════════════
-- ٠١٤٢ — تركيب فحصَي السلامة البصريّة (توثيقُ واقعٍ قائم)
-- ═══════════════════════════════════════════════════════════════
--
-- ⚠ إعادةُ بناءٍ من الحالة الحيّة على الإنتاج (٣١ أغسطس ٢٠٢٦)، لا النصّ
--   الأصليّ. مطبَّقٌ فعلًا (version 20260829024027) وملفّه مفقود.
--
-- الفحصان `w21_visual_integrity_locked` و`w21_visual_cron_alive` موجودان
-- في `run_critical_checks` على الإنتاج وغائبان عن المستودع كلّيًّا —
-- استخرجتُ نصَّهما حرفيًّا من التعريف الحيّ.
--
-- ── مرساةٌ محايدةُ الإصدار ──
-- لا أعتمد على نصّ فحصٍ بعينه قبلها (فترتيب الفحوص تغيّر مرارًا)، بل على
-- ذيل الدالّة الثابت منذ نشأتها. وأتخطّى بهدوءٍ إن كان الفحصان مركَّبَين
-- أصلًا — فهذا الملفّ يوثّق واقعًا مطبَّقًا، وإعادةُ تشغيله يجب ألّا
-- تُنتج فحصًا مكرّرًا.

do $mig$
declare d text; d2 text;
begin
  select pg_get_functiondef(p.oid) into d
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'run_critical_checks';

  if d is null then
    raise notice '٠١٤٢: run_critical_checks غير موجودة — تُخطّى.';
    return;
  end if;

  if position('w21_visual_integrity_locked' in d) > 0 then
    raise notice '٠١٤٢: الفحصان مركَّبان أصلًا — لا تكرار.';
    return;
  end if;

  d2 := replace(
    d,
    $srch$
  )
  select name, pass from checks;$srch$,
    $repl$,
    ('w21_visual_integrity_locked', (not has_function_privilege('anon','public.check_visual_integrity()','EXECUTE')
                                   and not has_function_privilege('anon','public.alert_visual_integrity()','EXECUTE')
                                   and not has_function_privilege('authenticated','public.check_visual_integrity()','EXECUTE'))),
    ('w21_visual_cron_alive',     (select schedule = '*/15 * * * *' and active
                                     from cron.job where jobname='visual-integrity'))
  )
  select name, pass from checks;$repl$);

  if d2 = d then
    raise exception '٠١٤٢: المرساة لم تُطابق — توقّف قبل أن أكسر شبكة الفحوص.';
  end if;
  execute d2;
end
$mig$;
