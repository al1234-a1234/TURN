-- ═══════════════════════════════════════════════════════════════
-- ٠١٤٥ — رفض نافذة الدوام الصفريّة (توثيقُ واقعٍ قائم)
-- ═══════════════════════════════════════════════════════════════
--
-- ⚠ إعادةُ بناءٍ من التعريف الحيّ على الإنتاج (٣١ أغسطس ٢٠٢٦)، لا النصّ
--   الأصليّ. مطبَّقٌ فعلًا (version 20260829182512) وملفّه مفقود.
--
-- ── ما فعله ──
-- `hours_have_bad_window(hours)` تكشف حالتين تُنتجان فرعًا «مفتوحًا
-- أبدًا» بلا أن يقصد المالك ذلك:
--   • `open = close` — نافذةٌ صفريّة، وعهد النظام «بلا ساعات = مفتوح»
--     يجعلها تعني «مفتوحٌ دائمًا» لا «مغلقٌ دائمًا».
--   • صيغةُ وقتٍ تالفة لا تُحوَّل إلى `time`.
-- ثم قيدُ `branch_settings_hours_sane` يمنع كتابتها أصلًا، لا يكتشفها بعد
-- وقوعها. والفحوص w23 تحرس القيد نفسه وتمنع فرعًا يتجاوز ٢٠ ساعةً يوميًّا.
--
-- ── لماذا يهمّ ──
-- `hours_have_bad_window` كانت غائبةً عن المستودع كلّيًّا، والقيد يعتمد
-- عليها — فإعادةُ بناءٍ من الترحيلات كانت ستفشل عند إنشاء القيد أصلًا.

begin;

create or replace function public.hours_have_bad_window(p_hours jsonb)
 returns boolean
 language plpgsql
 immutable
 set search_path to ''
as $function$
declare
  v_key text;
  v_o text; v_c text;
  v_ot time; v_ct time;
  v_bad_format boolean;
begin
  if p_hours is null or jsonb_typeof(p_hours) <> 'object' then
    return false;
  end if;

  for v_key, v_o, v_c in
    select '*'::text,
           nullif(btrim(p_hours->>'open'), ''),
           nullif(btrim(p_hours->>'close'), '')
    union all
    select d.key,
           nullif(btrim(d.value->>'open'), ''),
           nullif(btrim(d.value->>'close'), '')
      from jsonb_each(
             case when jsonb_typeof(p_hours->'days') = 'object'
                  then p_hours->'days' else '{}'::jsonb end) d
     where jsonb_typeof(d.value) = 'object'
  loop
    if v_o is null and v_c is null then
      continue;
    end if;

    v_bad_format := false;
    begin
      v_ot := case when v_o is null then null else v_o::time end;
      v_ct := case when v_c is null then null else v_c::time end;
    exception when others then
      v_bad_format := true;
    end;

    if v_bad_format then
      return true;
    end if;

    if v_ot is not null and v_ct is not null and v_ot = v_ct then
      return true;
    end if;
  end loop;

  return false;
end;
$function$;

do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'branch_settings_hours_sane') then
    alter table public.branch_settings
      add constraint branch_settings_hours_sane
      check (not public.hours_have_bad_window(opening_hours));
  end if;
end
$mig$;

commit;

-- ── الفحوص الثلاثة (w23) — موجودةٌ حيًّا وغائبةٌ عن المستودع ──
do $mig$
declare d text; d2 text;
begin
  select pg_get_functiondef(p.oid) into d
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'run_critical_checks';

  if d is null then
    raise notice '٠١٤٥: run_critical_checks غير موجودة — تُخطّى.';
    return;
  end if;

  if position('w23_hours_constraint_live' in d) > 0 then
    raise notice '٠١٤٥: الفحوص مركَّبة أصلًا — لا تكرار.';
    return;
  end if;

  d2 := replace(
    d,
    $srch$
  )
  select name, pass from checks;$srch$,
    $repl$,
    ('w23_hours_constraint_live', exists(select 1 from pg_constraint
                                    where conname='branch_settings_hours_sane')),
    ('w23_no_zero_window_hours',  not exists(select 1 from public.branch_settings
                                    where public.hours_have_bad_window(opening_hours))),
    ('w23_no_branch_open_24h',    not exists(
                                    select 1 from public.branches b
                                    join public.restaurants r on r.id = b.restaurant_id
                                    join public.branch_settings s on s.branch_id = b.id
                                    cross join generate_series(0,6) as d
                                   where b.is_active and r.is_active and not r.is_canary
                                     and s.accepts_waitlist
                                     and b.created_at < now() - interval '24 hours'
                                     and public.branch_open_hours_on(s.opening_hours, d) > 20))
  )
  select name, pass from checks;$repl$);

  if d2 = d then
    raise exception '٠١٤٥: المرساة لم تُطابق — توقّف قبل أن أكسر شبكة الفحوص.';
  end if;
  execute d2;
end
$mig$;
