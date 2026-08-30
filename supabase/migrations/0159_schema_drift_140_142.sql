-- ============================================================================
--  q20_schema_no_drift: تحديث بصمة الدوالّ ١٤٠ ← ١٤٢ عمدًا.
--
--  0157 و0158 أضافا دالّتين نائمتين (telegram_apply_pizza_peel_waitlist_cap،
--  telegram_apply_branch_lockdown_cleanup) — فتحرّكت بصمة الدوالّ فورًا،
--  تمامًا كما وثّق 0138 حين كسر 0137 (الذي أضاف telegram_command) نفس
--  الفحص. وهذا هو الفحص يعمل كما يجب: بصمة المخطّط تحرّكت فصرخ. فالواجب
--  تحديث المرجع عمدًا لا إسكات الفحص — لا نغيّر شرط الفحص نفسه ولا نحذفه،
--  فقط الرقم الذي يقارن به.
--
--  تحقّقتُ حيًّا على الإنتاج قبل هذا الترحيل: جداول=32 (لم يتغيّر) ·
--  دوالّ=142 (كانت 140) · سياسات=71 (لم يتغيّر) · مفاتيح أجنبية=40 (لم يتغيّر).
--  فالانحراف الوحيد هو الدالّتان الجديدتان، لا شيء آخر.
-- ============================================================================

do $mig$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'run_critical_checks';
  if v_def is null then raise exception 'run_critical_checks غير موجودة'; end if;

  if position('''public'' and p.prokind=''f'') = 140' in v_def) = 0 then
    raise exception 'النمط المتوقَّع (=140) غير موجود — راجع يدويًّا قبل المتابعة.';
  end if;

  v_def := replace(v_def, '''public'' and p.prokind=''f'') = 140', '''public'' and p.prokind=''f'') = 142');
  execute v_def;
end
$mig$;

-- المتوقَّع بعد التطبيق: q20_schema_no_drift أخضر مجدّدًا · 202/202 كاملًا.
