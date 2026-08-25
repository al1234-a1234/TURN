-- ════════════════════════════════════════════════════════════════════════════
--  ث‑٢ — الطابور والحجوزات: الصلاحيّة تحكم، والحذف للمالك والمدير، وكلّ حذفٍ يُدوَّن
--
--  الحال قبل هذا الترحيل: سياسةٌ واحدة لكلّ جدولٍ تغطّي ALL وتفحص الانتماء
--  للفرع وحده:
--      branch_id = ANY (coalesce((select my_branch_ids()), '{}'))
--  فخريطة permissions التي تُريها اللوحة للمالك لا تُستشار أصلًا في الجدولين
--  اللذين يحملان كلّ عمل المطعم. ثبت عمليًّا بموظّفٍ كلّ صلاحيّاته false:
--  قرأ ٧٨٧ صفَّ طابور، ومسحها، ومسح ١٢٠٧ حجزًا — بطلبٍ واحدٍ على PostgREST،
--  بلا مرورٍ باللوحة التي تُخفي عنه هذه الشاشات.
--
--  والمفارقة الكاشفة: المسار المحروس staff_clear_branch_queue يشترط مديرًا أو
--  مالكًا، ويرفض بلا سببٍ مكتوب، ويكتفي بـ status='expired'، ويدوّن في
--  admin_audit. أمّا الجدول المكشوف خلفه فيقبل DELETE صلبًا من مضيفٍ بلا
--  صلاحيّة، بلا سببٍ وبلا أثر. الدالّة أشدّ من الجدول الذي تحرسه.
--
--  العلاج ثلاثة أجزاء:
--  ١) دالّتان تُرجعان الفروع المسموحة — واحدةٌ بحسب الصلاحيّة، وأخرى للإدارة.
--  ٢) فصل العمليّات: قراءةٌ وإدخالٌ وتعديلٌ لصاحب الصلاحيّة داخل فرعه،
--     وحذفٌ للمالك أو المدير وحدهما.
--  ٣) مُطلِقُ تدوينٍ على كلّ DELETE في الجدولين — فما عاد الحذف بلا أثر.
-- ════════════════════════════════════════════════════════════════════════════

-- ── ١) الفروع المسموحة، محسوبةً مرّةً واحدة ────────────────────────────────
--
-- لماذا دالّةٌ تُرجع مصفوفةً بدل فحصٍ داخل السياسة؟ لأنّ السياسة تُقيَّم لكلّ
-- صفّ. فحصٌ يعتمد على restaurant_of_branch(branch_id) يستدعي دالّةً لكلّ صفٍّ
-- من آلاف الصفوف؛ أمّا مصفوفةٌ لا تعتمد على الصفّ فيحسبها المخطّط مرّةً
-- ويبقى الفحص احتواءً في مصفوفة — وهو ما تفعله my_branch_ids اليوم.
--
-- المنطق يطابق staff_has_perm: المالك والمدير فوق الخريطة، ومن دونهما تُقرأ
-- الخريطة. ويطابق my_branch_ids في حصر الموظّف المربوط بفرعٍ في فرعه.

create or replace function public.my_branch_ids_for(p_perm text)
returns uuid[]
language sql
stable
security definer
set search_path to ''
as $function$
  select case
    when public.is_platform_admin()
      then (select coalesce(array_agg(id), '{}') from public.branches)
    else (select coalesce(array_agg(br.id), '{}')
            from public.staff s
            join public.branches br on br.restaurant_id = s.restaurant_id
           where s.user_id = (select auth.uid())
             and s.is_active
             and (s.branch_id is null or s.branch_id = br.id)
             and (s.role in ('owner','manager')
                  or coalesce((s.permissions ->> p_perm)::boolean, false)))
  end;
$function$;

create or replace function public.my_managed_branch_ids()
returns uuid[]
language sql
stable
security definer
set search_path to ''
as $function$
  select case
    when public.is_platform_admin()
      then (select coalesce(array_agg(id), '{}') from public.branches)
    else (select coalesce(array_agg(br.id), '{}')
            from public.staff s
            join public.branches br on br.restaurant_id = s.restaurant_id
           where s.user_id = (select auth.uid())
             and s.is_active
             and (s.branch_id is null or s.branch_id = br.id)
             and s.role in ('owner','manager'))
  end;
$function$;

-- التنفيذ يُمنح لـanon أيضًا، لا لأنّ المجهول موظّف، بل لأنّ سياسات الجدولين
-- تُقيَّم على دور public، فيمرّ بها المجهول عند قراءته صفّه هو. وسحبُ دوالّ
-- السياسات من anon يُسقط كلّ القراءات العامّة بـ42501 — مثبتٌ تجريبيًّا.
revoke all on function public.my_branch_ids_for(text)  from public;
revoke all on function public.my_managed_branch_ids()  from public;
grant execute on function public.my_branch_ids_for(text) to anon, authenticated, service_role;
grant execute on function public.my_managed_branch_ids() to anon, authenticated, service_role;

-- ── ٢) فصل العمليّات ──────────────────────────────────────────────────────

drop policy if exists "staff manages branch waitlist"     on public.waitlist_entries;
drop policy if exists "staff manages branch reservations" on public.reservations;

-- الطابور: صلاحية waitlist
create policy "staff reads branch waitlist" on public.waitlist_entries
  for select using (
    branch_id = any (coalesce((select public.my_branch_ids_for('waitlist')), array[]::uuid[])));

create policy "staff adds to branch waitlist" on public.waitlist_entries
  for insert with check (
    branch_id = any (coalesce((select public.my_branch_ids_for('waitlist')), array[]::uuid[])));

create policy "staff updates branch waitlist" on public.waitlist_entries
  for update using (
    branch_id = any (coalesce((select public.my_branch_ids_for('waitlist')), array[]::uuid[])))
  with check (
    branch_id = any (coalesce((select public.my_branch_ids_for('waitlist')), array[]::uuid[])));

-- الحذف وحده يصعد درجةً: لا يكفي أن تكون صاحب الصلاحيّة، بل مالكًا أو مديرًا.
-- الإجلاس والإلغاء والانتهاء كلّها تغييرُ حالة — لا يحتاج المضيف الحذف أبدًا.
create policy "managers delete branch waitlist" on public.waitlist_entries
  for delete using (
    branch_id = any (coalesce((select public.my_managed_branch_ids()), array[]::uuid[])));

-- الحجوزات: صلاحية reservations
create policy "staff reads branch reservations" on public.reservations
  for select using (
    branch_id = any (coalesce((select public.my_branch_ids_for('reservations')), array[]::uuid[])));

create policy "staff adds branch reservations" on public.reservations
  for insert with check (
    branch_id = any (coalesce((select public.my_branch_ids_for('reservations')), array[]::uuid[])));

create policy "staff updates branch reservations" on public.reservations
  for update using (
    branch_id = any (coalesce((select public.my_branch_ids_for('reservations')), array[]::uuid[])))
  with check (
    branch_id = any (coalesce((select public.my_branch_ids_for('reservations')), array[]::uuid[])));

create policy "managers delete branch reservations" on public.reservations
  for delete using (
    branch_id = any (coalesce((select public.my_managed_branch_ids()), array[]::uuid[])));

-- ── ٣) كلّ حذفٍ يترك أثرًا ─────────────────────────────────────────────────
--
-- مُطلِقٌ لا فحصٌ في الكود: يصمد لأيّ مسار — PostgREST، ومفتاح الخدمة،
-- وسكربتٌ يُشغَّل يدويًّا من طرفيّة. ويحفظ الصفّ كاملًا في detail، فالحذف
-- المُدوَّن قابلٌ للاسترجاع لا للبكاء عليه.
--
-- لا مهمّةً مجدولةً تحذف من الجدولين (run_retention تمسّ owner_insights
-- و push_subscriptions فقط)، فلن يمتلئ السجلّ بحذفٍ آليّ.

create or replace function public.audit_row_delete()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  insert into public.admin_audit (actor, action, restaurant_id, branch_id, detail)
  values ((select auth.uid()),
          'delete:' || tg_table_name,
          public.restaurant_of_branch(old.branch_id),
          old.branch_id,
          to_jsonb(old));
  return old;
end;
$function$;

drop trigger if exists trg_audit_delete_waitlist on public.waitlist_entries;
create trigger trg_audit_delete_waitlist
  after delete on public.waitlist_entries
  for each row execute function public.audit_row_delete();

drop trigger if exists trg_audit_delete_reservations on public.reservations;
create trigger trg_audit_delete_reservations
  after delete on public.reservations
  for each row execute function public.audit_row_delete();
