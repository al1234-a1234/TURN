-- ============================================================================
--  سجلّ اليوم + الإرجاع — وحدةٌ واحدة.
--
--  ⛔ غير مطبَّق على الإنتاج. ينتظر إذنًا صريحًا.
--
--  ════════ الجرد الحيّ الذي بُني عليه هذا التصميم (الإنتاج هو المرجع) ════════
--  كلّ سطرٍ أدناه مقروءٌ من الإنتاج لا من المستودع:
--
--  (١) `guard_waitlist_status_transition` (fp 7a002789…) يرفع 23514 على **أيّ**
--      انتقالٍ من حالةٍ نهائيّة: seated/cancelled/expired/no_show ← أيّ شيء.
--      ⇒ **الإرجاع لا يمكن أن يكون قلبَ حالة على الصفّ نفسه.** الحارس يمنعه،
--      وإضعافه خطٌّ أحمر. فالإرجاع يُنشئ **صفًّا جديدًا** — وهو نفسه قرار
--      المالك السابق: «الإرجاع يضعه آخر الطابور».
--  (٢) `admin_audit`: ١٦٠٣ صفًّا، **١٥٨٨ منها (٩٩٪) `delete:waitlist_entries`**،
--      كلّها خلال ٢١ يومًا لمطعمٍ واحد (~٧٦/يوم). وتريغراه يمنعان UPDATE
--      وDELETE **وTRUNCATE** معًا ⇒ لا يُقلَّم أبدًا.
--  (٣) enum الحالة كاملًا: waiting · notified · seated · cancelled · no_show ·
--      expired (ستٌّ لا أربع).
--  (٤) القيد: EXCLUDE USING gist (branch_id =, zone =, position =)
--      WHERE (status in ('waiting','notified')) DEFERRABLE INITIALLY DEFERRED.
--  (٥) RLS على waitlist_entries: القراءة والتحديث والإدراج بـ
--      `my_branch_ids_for('waitlist')`، و**الحذف وحده** مصعَّدٌ إلى
--      `my_managed_branch_ids()` (مالك/مدير) — نمط ٠١٠٦.
--  (٦) `expire_stale_waitlist` (fp 599aa90c…) نافذتها المتدحرجة
--      `joined_at < now() - interval '8 hours'` — وهي «اليوم التشغيليّ».
--  فرقٌ عن المستودع: `expire_stale_waitlist` كانت **منحرفةً على المحاكاة**
--  (639c5b34…) فزُومنت إلى نسخة الإنتاج قبل أيّ اختبار.
--
--  ════════ القرار (أ): جدولٌ جديد، لا توسيع admin_audit ════════
--  بالدليل لا بالذوق: admin_audit **أصلًا** ٩٩٪ منه ضجيجُ طابور من مطعمٍ
--  واحد بمعدّل ٧٦ صفًّا/يوم. وسجلّ الحركة يضيف ~٢ صفًّا لكلّ ضيف. فعند ألف
--  مطعمٍ يصير الرقم مئات الآلاف يوميًّا في جدولٍ **يستحيل تقليمه** (الحذف
--  والاقتطاع ممنوعان بتريغر). أي نموٌّ بلا مخرج — وهو الفخّ الذي وقع فيه
--  admin_audit فعلًا.
--  فالجدول الجديد: يُقرأ بـRLS، يُكتب من النظام وحده، **ويُقلَّم بكرون**.
--  ولا يُجعل immutable عمدًا — لأنّ منعَ الحذف هو بالضبط ما جعل admin_audit
--  بلا مخرج.
--
--  ════════ القرار (ب): الإرجاع لمالك/مدير — مطروحٌ للمالك ════════
--  الافتراضيّ المُطبَّق هنا: `my_managed_branch_ids()`.
--  السبب: ٠١٠٦ صعّد **الحذف** وحده إلى مالك/مدير لأنّ المضيف لا يحتاجه في
--  التشغيل الطبيعيّ. والإرجاع فعلٌ استثنائيّ من نفس الصنف: تصحيحُ خطأ، لا
--  إجلاسٌ يتكرّر كلّ دقيقة. وهو يُنشئ صفًّا حيًّا جديدًا — أي يكتب في الطابور
--  بأثرٍ يراه العميل.
--  ⚠️ **قرارٌ يحتاج كلمة المالك**: إن تبيّن من التشغيل أنّ المضيف هو من
--  يكتشف الخطأ ويصحّحه لحظتَه (والمالك نائم)، فالبديل `my_branch_ids_for
--  ('waitlist')`. لم أختر صامتًا — الافتراضيّ هنا هو الأضيق، وتوسيعه سطرٌ واحد.
--
--  ════════ القرار (ج): الإرجاع يمرّ من مسار الترقيم لا كتابةً خامّة ════════
--  الإرجاع **لا يكتب `position` إطلاقًا**: يُدرج صفًّا بـposition = NULL،
--  فيتولّى `set_waitlist_position` توليدَه لنفس (فرع، **قسم**) تحت نفس
--  `FOR UPDATE` على صفّ الفرع، ويحرسه EXCLUDE. فلا تكرارَ صامتًا ولا خرقَ
--  للقيد — وهو بالضبط العطل الذي أُغلق في ٠١٦٨.
--
--  ════════ القرار (د): الرتبة مشتقّةٌ لحظةَ الحدث، لا العمود الخام ════════
--  عمود `position` يُعاد استخدامه (MAX يتجاهل المنتهية)، فلا يصحّ عرضه.
--  فالتريغر يحسب **الرتبة الحيّة داخل القسم** لحظةَ وقوع الحدث ويخزّنها
--  لقطةً (`from_rank`). وهي نفس حسبة `waitlist_ticket_by_id` حرفيًّا:
--  عددُ من أمامه في نفس (فرع، قسم) خلال ٨ ساعات، زائد واحد.
--  ولا يمكن حسابها لاحقًا لأنّ الصفّ يكون قد خرج من المجموعة الحيّة —
--  فاللقطة هي الطريقة الصحيحة الوحيدة.
--
--  ════════ لماذا التسجيل «لا يُفشل» عمليّة الطابور ════════
--  كتابةُ السجلّ ملفوفةٌ بـexception تبتلع الفشل: إجلاسُ عميلٍ واقفٍ على الباب
--  **لا يجوز** أن يفشل لأنّ سطر سجلٍّ تعذّر. ولأنّ الصمت خطر (درس الميثاق §٤:
--  «قناةٌ تُبلّغ عن فشل نفسها ليست قناة») يرافقه فحصٌ دائم يكشف توقّف التسجيل.
-- ============================================================================

-- ════════ (١) الجدول ════════
create table if not exists public.queue_events (
  id           uuid primary key default gen_random_uuid(),
  branch_id    uuid not null references public.branches(id) on delete cascade,
  entry_id     uuid references public.waitlist_entries(id) on delete set null,
  customer_id  uuid references public.customers(id) on delete restrict,
  -- نصٌّ لا enum: النوع يتوسّع لاحقًا ('moved' للسحب) بلا ترحيل نوعٍ جديد.
  -- والحارس CHECK يمنع القيم العشوائية ويُوسَّع بسطرٍ واحد.
  kind         text not null,
  zone         text,
  -- لقطة الرتبة المشتقّة لحظةَ الحدث (لا العمود الخام) — القرار (د).
  -- from_rank: رتبته قبل الحدث. to_rank: رتبته بعده (للسحب لاحقًا، وللإرجاع).
  from_rank    integer,
  to_rank      integer,
  -- من نفّذها: NULL يعني النظام (الكرون/انتهاء المهلة/إلغاء العميل نفسه).
  actor        uuid,
  detail       jsonb not null default '{}',
  at           timestamptz not null default now(),
  constraint queue_events_kind_check check (kind in
    ('notified','seated','cancelled','expired','no_show','restored','moved'))
);

comment on table public.queue_events is
  'سجلّ حركة الطابور لكلّ فرع. يُكتب من النظام (تريغر) ويُقرأ بـRLS ويُقلَّم بكرون — خلافًا لـadmin_audit الذي لا يُقلَّم.';

-- الفهرس المركّب من البداية لا بعد أن تبطئ الشاشة (شرط المالك الصريح).
create index if not exists idx_queue_events_branch_at
  on public.queue_events (branch_id, at desc);

-- ════════ (٢) RLS — نمط المصفوفة، لا دالّةً لكلّ صفّ ════════
alter table public.queue_events enable row level security;

-- القراءة: موظّفو الفرع بصلاحية الطابور. نفس نمط `staff reads branch waitlist`
-- حرفيًّا: مصفوفةٌ تُحسب مرّةً لا فحصٌ ينادي دالّةً لكلّ صفّ.
drop policy if exists "staff reads branch queue events" on public.queue_events;
create policy "staff reads branch queue events" on public.queue_events
  for select
  using (branch_id = any (coalesce((select public.my_branch_ids_for('waitlist')), array[]::uuid[])));

drop policy if exists "platform admin all queue events" on public.queue_events;
create policy "platform admin all queue events" on public.queue_events
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- ولا سياسةَ INSERT ولا UPDATE ولا DELETE لأحد: الكتابة من تريغر
-- SECURITY DEFINER (يتجاوز RLS)، والتقليم من كرونٍ بمفتاح الخدمة.
-- فالمستخدم يقرأ ولا يكتب — ولا يحتاج سياسةَ منعٍ صريحة، الافتراض هو المنع.

revoke all on public.queue_events from public, anon, authenticated;
grant select on public.queue_events to authenticated;

-- ════════ (٣) التسجيل التلقائيّ ════════
-- AFTER UPDATE OF status: يلتقط كلّ مسارٍ بلا استثناء — الاستقبال، وإلغاء
-- العميل نفسه، والكرون (expire_stale_waitlist). ولو سجّلنا من التطبيق وحده
-- لغابت حركات الكرون تمامًا.
--
-- ولماذا AFTER لا BEFORE: الرتبة تُحسب بعدّ **من أمامه** (`position <`)، وهم
-- لم يتغيّروا. والصفّ نفسه خرج من المجموعة الحيّة فلا يَعُدّ نفسه — فالحسبة
-- صحيحةٌ بعد التغيير كما هي قبله، وAFTER أأمن (لا يعطّل الكتابة الأصليّة).
create or replace function public.log_queue_event()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare v_rank int;
begin
  -- الفشل هنا لا يُفشل إجلاس عميل. والصمت يكشفه فحص w41.
  begin
    select count(*)::int + 1 into v_rank
      from public.waitlist_entries w2
     where w2.branch_id = old.branch_id
       and w2.zone is not distinct from old.zone
       and w2.status in ('waiting','notified')
       and w2."position" < old."position"
       and w2.joined_at > now() - interval '8 hours';

    insert into public.queue_events (branch_id, entry_id, customer_id, kind, zone, from_rank, actor, detail)
    values (old.branch_id, old.id, old.customer_id, new.status::text, old.zone, v_rank,
            (select auth.uid()),
            jsonb_build_object('from_status', old.status::text, 'party_size', old.party_size));
  exception when others then
    null;
  end;
  return null;
end;
$function$;

drop trigger if exists trg_log_queue_event on public.waitlist_entries;
create trigger trg_log_queue_event
  after update of status on public.waitlist_entries
  for each row
  when (old.status is distinct from new.status
        and new.status in ('notified','seated','cancelled','expired','no_show'))
  execute function public.log_queue_event();

-- ════════ (٤) الإرجاع ════════
-- يُنشئ صفًّا جديدًا (الحارس يمنع قلب الحالة — انظر الجرد ١)، بنفس القسم،
-- ورقمه من مسار الترقيم لا كتابةً خامّة.
create or replace function public.restore_queue_entry(p_entry_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_old record;
  v_existing uuid;
  v_new_id uuid;
  v_rank int;
begin
  -- قفلُ صفّ الطابور نفسه — لا advisory وحده. هذا ما يُسلسِل الإرجاع مع
  -- expire_stale_waitlist (تُحدّث نفس الصفّ) ومع إرجاعٍ ثانٍ متزامن.
  select w.id, w.branch_id, w.customer_id, w.zone, w.party_size, w.status, w.joined_at
    into v_old
    from public.waitlist_entries w
   where w.id = p_entry_id
     for update;

  if v_old.id is null then
    raise exception 'الحركة غير موجودة' using errcode = 'P0404';
  end if;

  -- الصلاحية داخل الدالّة لا في الواجهة: نداءٌ مباشر عبر PostgREST يتخطّى
  -- الزرّ المخفيّ. (عطل ث-٢ في ٠١٠٦ — لا يُعاد فتحه هنا.)
  if not (public.is_platform_admin()
          or v_old.branch_id = any (coalesce(public.my_managed_branch_ids(), array[]::uuid[]))) then
    raise exception 'غير مخوّل' using errcode = '42501';
  end if;

  if v_old.status not in ('cancelled','expired','no_show','seated') then
    raise exception 'لا يُرجَع صفٌّ ما زال في الطابور' using errcode = 'P0412';
  end if;

  -- نافذة الإرجاع: ١٥ دقيقة من الإزالة. تغطّي الخطأ المكتشَف لحظتَه وعودةَ
  -- من تأخّر، ولا تُبقي زرًّا يعيد من انصرف قبل نصف ساعة.
  if not exists (
    select 1 from public.queue_events e
     where e.entry_id = p_entry_id
       and e.kind in ('cancelled','expired','no_show','seated')
       and e.at > now() - interval '15 minutes'
  ) then
    raise exception 'انتهت مهلة الإرجاع (١٥ دقيقة)' using errcode = 'P0413';
  end if;

  -- خموليّة: من عاد إلى الطابور (بإرجاعٍ سابق أو بانضمامه بنفسه) لا يُكرَّر.
  -- وهذا أيضًا ما يمنع اصطدام uniq_waitlist_live_customer_branch.
  select w.id into v_existing
    from public.waitlist_entries w
   where w.branch_id = v_old.branch_id
     and w.customer_id = v_old.customer_id
     and w.status in ('waiting','notified')
   limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  -- صفٌّ جديد: position = NULL عمدًا ⇒ set_waitlist_position يولّده لنفس
  -- (فرع، قسم) تحت قفل الفرع، وEXCLUDE يحرسه.
  insert into public.waitlist_entries (branch_id, customer_id, party_size, zone)
       values (v_old.branch_id, v_old.customer_id, v_old.party_size, v_old.zone)
    returning id into v_new_id;

  select count(*)::int + 1 into v_rank
    from public.waitlist_entries w2
   where w2.branch_id = v_old.branch_id
     and w2.zone is not distinct from v_old.zone
     and w2.status in ('waiting','notified')
     and w2."position" < (select w3."position" from public.waitlist_entries w3 where w3.id = v_new_id)
     and w2.joined_at > now() - interval '8 hours';

  insert into public.queue_events (branch_id, entry_id, customer_id, kind, zone, from_rank, to_rank, actor, detail)
  values (v_old.branch_id, v_new_id, v_old.customer_id, 'restored', v_old.zone,
          (select e.from_rank from public.queue_events e
            where e.entry_id = p_entry_id and e.kind <> 'restored'
            order by e.at desc limit 1),
          v_rank, (select auth.uid()),
          jsonb_build_object('restored_from', p_entry_id, 'from_status', v_old.status::text));

  return v_new_id;
end;
$function$;

revoke all on function public.restore_queue_entry(uuid) from public, anon;
grant execute on function public.restore_queue_entry(uuid) to authenticated, service_role;

-- ════════ (٥) قراءة السجلّ — اليوم التشغيليّ المتدحرج لا التقويميّ ════════
-- خطٌّ أحمر: عطل «اليوم التقويميّ» وقع مرّتين (٠١٦٥، ٠١٦٦). النافذة هنا
-- تطابق `expire_stale_waitlist`: ٨ ساعاتٍ متدحرجة، بلا أيّ `::date`.
create or replace function public.branch_day_log(p_branch_id uuid, p_limit integer default 50)
returns table(
  event_id uuid, entry_id uuid, kind text, zone text,
  from_rank integer, to_rank integer, at timestamptz,
  customer_name text, actor_name text, restorable boolean
)
language sql
stable
security definer
set search_path to ''
as $function$
  select e.id, e.entry_id, e.kind, e.zone, e.from_rank, e.to_rank, e.at,
         c.full_name,
         s.name,
         (e.kind in ('cancelled','expired','no_show','seated')
          and e.at > now() - interval '15 minutes'
          and not exists (
            select 1 from public.waitlist_entries w
             where w.branch_id = e.branch_id and w.customer_id = e.customer_id
               and w.status in ('waiting','notified')))
    from public.queue_events e
    left join public.customers c on c.id = e.customer_id
    left join public.staff s on s.user_id = e.actor and s.restaurant_id =
         (select b.restaurant_id from public.branches b where b.id = e.branch_id)
   where e.branch_id = p_branch_id
     and e.at > now() - interval '8 hours'
     and (public.is_platform_admin()
          or e.branch_id = any (coalesce(public.my_branch_ids_for('waitlist'), array[]::uuid[])))
   order by e.at desc
   limit least(greatest(coalesce(p_limit, 50), 1), 200);
$function$;

revoke all on function public.branch_day_log(uuid, integer) from public, anon;
grant execute on function public.branch_day_log(uuid, integer) to authenticated, service_role;

-- ════════ (٦) التقليم — المخرج الذي يفتقده admin_audit ════════
create or replace function public.prune_queue_events()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare n int;
begin
  delete from public.queue_events where at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end;
$function$;

revoke all on function public.prune_queue_events() from public, anon, authenticated;

select cron.schedule('prune-queue-events', '20 3 * * *', $$select public.prune_queue_events();$$)
where not exists (select 1 from cron.job where jobname = 'prune-queue-events');

-- ════════ (٧) الحرّاس الدائمون ════════
-- كلٌّ منهم أُثبت **عمليًّا** أنّه يسقط بزرع الخلل ثمّ يعود بعد التراجع
-- (نفس منهج w3/w38/w39/w40). ويُضاف `queue_events` إلى قائمة
-- `branch_rls_everywhere` لأنّها قائمةٌ مكتوبةٌ بالاسم — وجدولٌ جديد يحمل
-- `branch_id` ولا يُدرَج فيها يبقى خارج الحارس صامتًا (قاعدة CLAUDE.md).
do $mig$
declare d text; d2 text;
begin
  if not exists (select 1 from pg_proc where proname='run_critical_checks' and pronamespace='public'::regnamespace) then
    raise notice 'run_critical_checks غير موجودة (محاكاة) — تخطّي الفحوص';
    return;
  end if;
  select pg_get_functiondef(oid) into d
    from pg_proc where proname='run_critical_checks' and pronamespace='public'::regnamespace;

  -- أ) إدراج الجدول الجديد في حارس عزل الفروع
  d2 := replace(d,
    E'\'restaurant_photos\',\n                                                       \'reviews\',\'branches\',\'staff\')',
    E'\'restaurant_photos\',\n                                                       \'reviews\',\'branches\',\'staff\',\'queue_events\')');
  if d2 = d then
    raise exception 'لم أجد قائمة branch_rls_everywhere — توقّف قبل ترك الجدول خارج الحارس.';
  end if;

  -- ب) الحرّاس الأربعة
  if position('w41_queue_log_trigger' in d2) = 0 then
    d2 := replace(d2, E'    (\'q20_schema_no_drift\',',
         E'    (\'w41_queue_log_trigger\',    (select count(*)=1 from pg_trigger t\n'
      || E'                                    join pg_class c on c.oid=t.tgrelid\n'
      || E'                                   where c.relname=\'waitlist_entries\'\n'
      || E'                                     and t.tgname=\'trg_log_queue_event\' and t.tgenabled=\'O\')),\n'
      || E'    (\'w42_queue_events_rls\',     (select relrowsecurity from pg_class where oid=\'public.queue_events\'::regclass)\n'
      || E'                                  and exists(select 1 from pg_policies\n'
      || E'                                   where schemaname=\'public\' and tablename=\'queue_events\'\n'
      || E'                                     and cmd=\'SELECT\' and qual like \'%my_branch_ids%\')),\n'
      || E'    (\'w43_queue_events_prunable\',exists(select 1 from pg_proc\n'
      || E'                                   where proname=\'prune_queue_events\' and pronamespace=\'public\'::regnamespace)\n'
      || E'                                  and not exists(select 1 from public.queue_events\n'
      || E'                                   where at < now() - interval \'35 days\')),\n'
      || E'    (\'w44_restore_manager_only\', (select pg_get_functiondef(oid) like \'%my_managed_branch_ids%\'\n'
      || E'                                   from pg_proc where proname=\'restore_queue_entry\'\n'
      || E'                                     and pronamespace=\'public\'::regnamespace)),\n'
      || E'    (\'q20_schema_no_drift\',');
  end if;

  -- ج) بصمة الانحراف: +١ جدول (queue_events) و+٤ دوالّ
  --    (log_queue_event · restore_queue_entry · branch_day_log · prune_queue_events)
  d2 := replace(d2, 'c.relkind=''r'') = 33', 'c.relkind=''r'') = 34');
  d2 := replace(d2, 'p.prokind=''f'') = 145', 'p.prokind=''f'') = 149');

  execute d2;
end
$mig$;

-- المتوقَّع بعد التطبيق: ٢١٢/٢١٢ خضراء (٢٠٨ + w41..w44)، وq20 على ٣٤ جدولًا
-- و١٤٩ دالّة. أمّا فحص العزل q77 فيعيش في supabase/tests/isolation_checks.sql.
