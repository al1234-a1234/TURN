-- ============================================================================
--  فحص انحدار الصلاحيات — البند الثامن.
--
--  ── لماذا هذا البند بالذات، ولماذا فوريّ ──
--  السبعة التي أقرّها المالك كلّها توفّرٌ وصحّة: صفحةٌ تسقط، انضمامٌ يفشل،
--  قاعدةٌ تنقطع، كرونٌ يتوقّف. وكلّها **قابلةٌ للتدارك** — تُصلَح فيعود
--  الحال. أمّا انكشافُ البيانات فلا يُرَدّ: ما قرأه أحدٌ لا يمكن أن يُنسى،
--  فتأخيرُ ٢٤ ساعة في تقريرٍ يوميّ هو نافذة الاختراق كلّها.
--
--  ── وليس افتراضًا: حدث في هذا المشروع ثلاث مرّات ──
--    ٠١٩٢  `public.http_get` كانت قابلة للتنفيذ من `anon` عبر PostgREST —
--          ومن يملك المفتاح العلنيّ (وهو مشحونٌ في حزمة المتصفّح) يجعل
--          قاعدتنا تطلب أيّ عنوانٍ يختاره. SSRF كامل. **ولم يكتشفه أيّ
--          تنبيه** — اكتُشف بتدقيقٍ يدويّ بعد أن عاش.
--    ٠١٧٧  موجةٌ أولى لسحب دوالّ التقارير من العملاء.
--    ٠١٧٩  موجةٌ ثانية لسحب المنبّهات والمحفّزات والجداول المختومة.
--  و١٢ ترحيلًا في المستودع تمسّ منح/سحب `anon`. فهذا سطحٌ يتحرّك فعلًا.
--
--  ── وصفر سطح إنذارٍ كاذب ──
--  الفحص يقرأ فهرس النظام وحده: لا شبكة، ولا مهلة، ولا بيانات طُعم، ولا
--  توقيت. لا يمكن أن يتقلّب. ولا يتحرّك إلّا حين نَنشر ترحيلًا يغيّر
--  صلاحية — وذلك بالضبط ما يستحقّ النظر.
--
--  ── ثلاثة أذرع ──
--   ١) كلّ جدولٍ في public عليه RLS.
--   ٢) كلّ دالّة SECURITY DEFINER لها search_path مثبَّت (وإلّا اختُطف
--      مسارُها بجدولٍ يُزرع في مخطّطٍ أسبق).
--   ٣) `anon` لا ينفّذ إلّا الثلاثين المسموحة — بالاسم **وبالعدد معًا**:
--      الاسم وحده يمرّر حِملًا زائدًا (overload) بنفس الاسم ومعاملاتٍ
--      أخرى، والعدد يكشفه.
--
--  ── ولماذا `anon` وحده دون `authenticated` ──
--  مفتاح `anon` علنيٌّ بحكم التعريف ويُشحن في حزمة المتصفّح، فمن فتح الصفحة
--  يملكه. و`authenticated` جلسةُ موظّفٍ حقيقيّ خلف RLS، وسطحُه يتّسع
--  ويضيق مع كلّ ميزةٍ للاستقبال — فإدخاله هنا يُنتج ضجيجًا لا خبرًا.
--  وهو أيضًا الدور الذي وقع فيه CRITICAL-1 فعلًا.
--
--  ── ما لا يفعله هذا الترحيل ──
--  لا يغيّر صلاحيةً واحدة، ولا يسحب ولا يمنح. رصدٌ فقط. والحالة اليوم
--  نظيفة ومقيسة: ٣٦ جدولًا · ٠ بلا RLS · ٠ دالّة معرَّفة أمنيًّا بلا
--  search_path · ٣٠ دالّة لـ`anon`. فالفحص يُولد أخضر ويبقى كذلك حتى
--  يتحرّك شيء.
--
--  ── والتنبيه الفوريّ عليه ليس هنا ──
--  محرّك التنبيه الحاليّ يقرأ `check_platform_health()` وحدها. ربطُ هذا
--  الفحص بالإرسال يقع في زوج إعادة بناء المحرّك (الزوج الثالث)، ومعه
--  إغلاق فجوةٍ أعمّ: أنّ **أيّ** فحصٍ حرجٍ يحمرّ لا يُنتج تنبيهًا اليوم.
--  فإلى ذلك الحين يظهر هذا الفحص في ملخّص المشغّل مرّتين يوميًّا.
-- ============================================================================

create or replace function public.check_permission_drift()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with rls as (
    select count(*) as n, string_agg(c.relname, '، ' order by c.relname) as names
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  ),
  secdef as (
    select count(*) as n, string_agg(p.proname, '، ' order by p.proname) as names
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
       and not exists (
         select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) cfg
          where cfg like 'search_path=%'
       )
  ),
  anon_fns as (
    select p.oid, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  extra as (
    select count(*) as n, string_agg(proname, '، ' order by proname) as names
      from anon_fns
     where proname <> all (array[
       'branch_open_by_hours','branch_open_hours_on','can_access_branch',
       'clear_confirmed_on_no_show','gen_reward_code',
       'guard_reservation_status_transition','guard_waitlist_status_transition',
       'has_feature','health_snapshot','hours_have_bad_window',
       'is_brand_manager','is_manager_of','is_platform_admin','is_staff_of',
       'my_branch_ids','my_branch_ids_for','my_managed_branch_ids',
       'norm_phone_input','queue_version','reservation_slots',
       'restaurant_of_branch','set_reservation_time_range',
       'staff_can_read_customer','staff_has_perm','touch_updated_at','tv_queue',
       'waitlist_counts_by_zone','waitlist_counts_for',
       'waitlist_ticket_by_id','waitlist_ticket_status'
     ])
  ),
  total as (select count(*) as n from anon_fns)
  select jsonb_build_object(
    'ok', (rls.n = 0 and secdef.n = 0 and extra.n = 0 and total.n = 30),
    'tables_missing_rls',
      jsonb_build_object('count', rls.n, 'names', rls.names),
    'secdef_without_search_path',
      jsonb_build_object('count', secdef.n, 'names', secdef.names),
    'anon_beyond_allowlist',
      jsonb_build_object('count', extra.n, 'names', extra.names),
    'anon_total',
      jsonb_build_object('count', total.n, 'expected', 30)
  )
  from rls, secdef, extra, total;
$function$;

comment on function public.check_permission_drift() is
  'رصد انحدار الصلاحيات: جدولٌ فقد RLS · دالّة معرَّفة أمنيًّا بلا search_path · anon ينفّذ خارج قائمة الثلاثين. خطّ الأساس يُرفع عمدًا عند كلّ تغييرٍ مقصود، كما يُرفع q20.';

revoke all on function public.check_permission_drift() from public, anon, authenticated;

-- حارسٌ دائم في البطاريّة. وبإحلالٍ نصّيٍّ مرتكز لا بإعادة كتابة (الميثاق §٣-أ).
-- وعدّاد الدوالّ يُرفع معه في الملفّ نفسه: ١٤٤ ← ١٤٥ (هذه الدالّة وحدها).
-- الجداول ٣٦ والسياسات ٧٣ والمفاتيح ٤٤ لا تتحرّك.
do $mig$
declare v_def text; v_before text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='run_critical_checks';
  if v_def is null then raise exception 'run_critical_checks غير موجودة'; end if;

  v_before := v_def;

  if position('w30_no_permission_drift' in v_def) = 0 then
    v_def := replace(v_def, E'    (\'w28_push_log_names_sub\',',
        E'    (\'w30_no_permission_drift\', (public.check_permission_drift() ->> \'ok\')::boolean),\n'
     || E'    (\'w28_push_log_names_sub\',');
  end if;

  v_def := replace(v_def, E'and p.prokind=\'f\') = 144', E'and p.prokind=\'f\') = 145');

  if v_def = v_before then
    raise exception 'لم يُطابَق مرتكز w28 ولا عدّاد ١٤٤ — راجع الحالة قبل المتابعة';
  end if;

  execute v_def;
end
$mig$;
