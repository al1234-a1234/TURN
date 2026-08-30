-- ============================================================================
--  زرّا «طبّق الاثنين» / «لا الآن» في تلغرام — تنفيذٌ حقيقيّ لا وعد.
--
--  المالك لا يريد قراءة نصٍّ طويل ولا فتح لوحة: يضغط زرًّا في تلغرام،
--  فتُطبَّق الحملتان معًا (قفل صلاحية الإنشاء RLS + حذف الفروع المكرّرة) أو
--  لا شيء. هذا الترحيل **لا يغيّر أيّ سياسةٍ ولا يحذف أيّ صفّ بنفسه** — هو
--  فقط يُعرِّف دالّةً نائمة لا تُنفَّذ إلا حين يستدعيها مسار الويبهوك بعد
--  التحقّق من هويّة المُرسِل. فتطبيقه على الإنتاج آمنٌ ولا يمسّ شيئًا حتى
--  يُضغَط الزرّ فعلًا.
--
--  ── لماذا دالّةٌ مستقلّة لا تمديدٌ لـtelegram_command ──
--  هذا البند وبند سقف الطابور (فرعٌ آخر) كلاهما يحتاج قفزًا في نفس الدالّة
--  المركزيّة telegram_command، وكلاهما على فرعٍ منفصل يُدمج باستقلالٍ عن
--  الآخر. تمديد نفس الدالّة من فرعين مختلفين يعني أنّ أيّهما يُطبَّق أخيرًا
--  يمحو تمديد الآخر ما لم يُنسَّقا يدويًّا — خطرٌ لا داعي له. فكلّ بندٍ يُعرِّف
--  دالّته الخاصّة المستقلّة تمامًا (تتحقّق من هويّة المُرسِل بنفسها، بنفس نمط
--  telegram_command)، ومسار الويبهوك (كودُ تطبيقٍ، لا قاعدة) هو من يوجّه نصّ
--  الزرّ إلى الدالّة الصحيحة — إضافةٌ محايدة لا تتعارض بين الفروع.
--
--  ── ما تفعله الدالّة بالضبط، حرفيًّا كما في 0155 و0156 غير المطبَّقين ──
--  ١) RLS: تفصل «managers manage branches» (FOR ALL) إلى سياستين — الأدمن
--     وحده ينشئ، والإدارة تُحدِّث فقط. **مضبوطةٌ لتكون آمنةً عند إعادة
--     التشغيل**: إن كانت السياسة الجديدة موجودةً مسبقًا (زرٌّ ضُغط مرّتين
--     خطأً) تتجاوز هذه الخطوة بلا خطأ، لا تحاول إنشاءها ثانيةً.
--  ٢) حذف الثمانية فروع Pizza peel المكرّرة المعطّلة بمعرّفاتها الصريحة —
--     نفس حارسي 0156: العدد ٨ بالضبط وكلّها معطّلة، وصفر بياناتٍ حيّة في كلّ
--     جدولٍ يشير إليها، وإلا توقّفٌ بخطأٍ صريح بدل حذفٍ أعمى (الحالة قد
--     تختلف عمّا وُثِّق إن مرّ وقتٌ طويل قبل الضغط).
--  ٣) فحصٌ دائم w32_branch_insert_admin_only يمنع رجوع صلاحية الإنشاء خارج
--     /admin صامتًا — بنفس منطق 0155 (idempotent: لا يُضاف مرّتين).
-- ============================================================================

create or replace function public.telegram_apply_branch_lockdown_cleanup(p_chat_id text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_owner text;
  v_ids uuid[] := array[
    'ce6a77c6-61c3-4846-876f-30ec6f10b811',
    'afc5e670-bcba-4b6d-9e9a-f123ba7dfbd8',
    '7fabfde7-6f41-4616-ba5c-cf7b4281f82f',
    'ffea4abf-8868-4059-9cec-7208203101bd',
    '344c292c-ec84-4070-b722-e97686582507',
    'fa42f58c-4f58-4918-b7a3-c85a4b3594c7',
    '0755c0fd-bacd-449e-b8a8-87ffa1ec6855',
    '5f742023-26dc-4ed2-9e7f-f7d049833c7d'
  ];
  v_found int;
  v_live_data int;
  v_deleted int := 0;
  v_rls_done boolean := false;
  v_def text;
  v_checks_done boolean := false;
begin
  -- هويّة المُرسِل — نفس مصدر الحقيقة الذي يعتمده telegram_command.
  select btrim(value) into v_owner from alert_config where key = 'telegram_chat_id';
  if v_owner is null or v_owner = '' or btrim(coalesce(p_chat_id, '')) <> v_owner then
    return null;
  end if;

  -- (١) قفل RLS — يتخطّى بأمان إن كان مطبَّقًا مسبقًا.
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'branches'
       and policyname = 'managers manage branches'
  ) then
    drop policy "managers manage branches" on public.branches;
    create policy "managers update branches" on public.branches for update
      using (is_manager_of(restaurant_id) and can_access_branch(id))
      with check (
        is_manager_of(restaurant_id)
        and (
          is_platform_admin()
          or exists (
            select 1 from public.staff s
             where s.user_id = (select auth.uid())
               and s.is_active
               and s.restaurant_id = branches.restaurant_id
               and (s.branch_id is null or s.branch_id = branches.id)
          )
        )
      );
    comment on policy "managers update branches" on public.branches is
      'مدير المطعم يعدّل فروعه القائمة (مثلًا: تعطيل مؤقّت) — لا ينشئ جديدًا. الإنشاء حصرًا لـ admin manages branches.';
    v_rls_done := true;
  end if;

  -- (٢) حذف الثمانية — نفس حارسي 0156 بالضبط.
  select count(*) into v_found
    from public.branches
   where id = any(v_ids) and is_active = false
     and restaurant_id = (select id from public.restaurants where slug = 'pizza-peel');

  if v_found = array_length(v_ids, 1) then
    select
        (select count(*) from public.waitlist_entries where branch_id = any(v_ids))
      + (select count(*) from public.reservations where branch_id = any(v_ids))
      + (select count(*) from public.menu_categories where branch_id = any(v_ids))
      + (select count(*) from public.menu_items where branch_id = any(v_ids))
      + (select count(*) from public.daily_stats where branch_id = any(v_ids))
      + (select count(*) from public.notifications where branch_id = any(v_ids))
      + (select count(*) from public.reviews where branch_id = any(v_ids))
      + (select count(*) from public.staff where branch_id = any(v_ids))
      + (select count(*) from public.tables where branch_id = any(v_ids))
    into v_live_data;

    if v_live_data > 0 then
      raise exception 'وُجدت % صفّ بياناتٍ حيّة مرتبطة بهذه الفروع — توقّفٌ أمانًا، راجع يدويًّا.', v_live_data;
    end if;

    delete from public.branches where id = any(v_ids);
    get diagnostics v_deleted = row_count;
  elsif v_found > 0 then
    raise exception 'توقّع % صفًّا معطّلًا بهذه المعرّفات، وُجد %. توقّفٌ أمانًا — لا حذف.',
      array_length(v_ids, 1), v_found;
  end if;
  -- v_found = 0: حُذفت مسبقًا (ضغطٌ متكرّر) — لا خطأ، v_deleted تبقى 0.

  -- (٣) الفحص الدائم — idempotent.
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'run_critical_checks';
  if v_def is not null and position('w32_branch_insert_admin_only' in v_def) = 0 then
    v_def := replace(v_def, E'    (\'q20_schema_no_drift\',',
      E'    (\'w32_branch_insert_admin_only\', not exists (\n'
   || E'        select 1 from pg_policies\n'
   || E'         where schemaname=\'public\' and tablename=\'branches\'\n'
   || E'           and cmd in (\'INSERT\',\'ALL\') and policyname <> \'admin manages branches\')),\n'
   || E'    (\'q20_schema_no_drift\',');
    execute v_def;
    v_checks_done := true;
  end if;

  return '✅ طُبِّق:' || E'\n' ||
    case when v_rls_done then '• قفل RLS: تمّ (الإنشاء حصرًا لـ/admin)' || E'\n'
         else '• قفل RLS: كان مطبَّقًا مسبقًا' || E'\n' end ||
    '• حذف الفروع المكرّرة: ' || v_deleted || ' فرعًا' || E'\n' ||
    case when v_checks_done then '• فحصٌ دائم جديد: أُضيف' || E'\n'
         else '• فحصٌ دائم: كان موجودًا' || E'\n' end ||
    'شغّل /فحص للتأكّد.';
end;
$function$;

revoke all on function public.telegram_apply_branch_lockdown_cleanup(text) from public;
revoke all on function public.telegram_apply_branch_lockdown_cleanup(text) from anon, authenticated;
