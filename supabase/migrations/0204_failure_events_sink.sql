-- ============================================================================
--  مصرف الأعطال الحقيقيّة — الأساس الذي تقوم عليه إعادة بناء التنبيهات.
--
--  ── لماذا ──
--  منظومة التنبيه اليوم **تسأل** نفسها كل ٥ دقائق «هل أنا بخير؟» بمسابير
--  اصطناعيّة تكتب على مستأجرٍ وهميّ. فتُنتج ٢٨ رسالة تقلّب في ٣٦ ساعة لا
--  عطلَ حقيقيًّا واحدًا بينها، وتعجز في الوقت نفسه عن رؤية انكسار الحجز في
--  مطعمٍ حقيقيّ. المبدأ الجديد: **لا يُطلق تنبيهٌ إلّا من أثرٍ خلّفه مرورٌ
--  حقيقيّ.** وهذا الجدول هو ذلك الأثر.
--
--  ── الفجوة التي يسدّها ──
--  فشلُ الانضمام الحقيقيّ يُترجَم اليوم إلى رسالةٍ لطيفة للعميل في
--  `src/app/r/[slug]/actions.ts:183` **ولا يُسجَّل في أيّ مكان**. وأخطاءُ
--  الخادم ٥٠٠ لا مصرفَ لها أصلًا — `client_errors` يلتقط انهيار المتصفّح
--  وحده عبر `error.tsx`. فلا مادّةَ يقرأها تنبيهٌ صادق.
--
--  ── ما ليس عطلًا، وهو أهمّ ما في هذا الملفّ ──
--  «الطابور ممتلئ» و«الفرع مغلق» و«لا يوجد انتظار» **ليست أعطالًا** — هي
--  سلوكٌ صحيحٌ مقصود. تسجيلُها هنا يعيد الإنذار الكاذب من الباب الخلفيّ.
--  والترشيح يقع على الكاتب (`EXPECTED_JOIN_CODES` في `join-errors.ts`)
--  مصدرًا واحدًا للرسالة وللترشيح معًا، كي لا ينحرف الموضعان.
--
--  ── لا شيء يُنشر بهذا الترحيل ──
--  الجدول والدالّة فقط. الكتّاب (instrumentation.ts وactions.ts) وقارئ
--  التنبيه يأتون في أزواجٍ لاحقة. فالمصرف يبقى فارغًا حتى يُشحن كاتبُه،
--  وهذا مقصود: أساسٌ أوّلًا، بلا تغييرٍ في سلوكٍ يراه ضيف.
-- ============================================================================

create table public.failure_events (
  id        bigserial primary key,
  at        timestamptz not null default now(),
  -- نوعٌ مغلق لا حرّ: نوعٌ مجهول يعني كاتبًا انحرف، ولا نخزّن ما لا نقرأ.
  kind      text        not null,
  path      text,
  code      text,
  -- ON DELETE SET NULL لا CASCADE: حذفُ فرعٍ لا يمحو تاريخ أعطاله.
  branch_id uuid        references public.branches(id) on delete set null,
  detail    jsonb       not null default '{}'::jsonb
);

-- القارئ يسأل دائمًا «هذا النوع، في هذه النافذة» — فالفهرس مركّبٌ بهذا الترتيب.
create index failure_events_kind_at_idx on public.failure_events (kind, at desc);
-- والتنظيف يمسح بالزمن وحده.
create index failure_events_at_idx      on public.failure_events (at);

comment on table public.failure_events is
  'أعطالٌ وقعت لمرورٍ حقيقيّ (٥٠٠ خادميّ · فشل انضمام غير متوقَّع). مصدرُ التنبيه الفوريّ منذ ٠٢٠٤. لا يُكتب إلّا عبر log_failure_event، ولا يُقرأ إلّا بمفتاح الخدمة.';

-- جدولٌ مختوم — نفس نمط client_errors حرفيًّا: RLS مفعّل وصفر سياسات، فلا
-- يقرؤه ولا يكتبه أيّ دورٍ علنيّ. الكتابة تمرّ من الدالّة المعرَّفة أمنيًّا،
-- والقراءة بمفتاح الخدمة وحده.
alter table public.failure_events enable row level security;

revoke all on public.failure_events from anon, authenticated;

create or replace function public.log_failure_event(
  p_kind      text,
  p_path      text  default null,
  p_code      text  default null,
  p_branch_id uuid  default null,
  p_detail    jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- (١) نوعٌ معروفٌ وحده
  if p_kind is null or p_kind not in ('page_5xx', 'join_failed') then
    return;
  end if;

  -- (٢) سقف إغراقٍ صلب — نفس رقم log_client_error وسببه: أكثر من ٥٠٠ في
  --     الساعة عاصفةٌ أو هجوم، وتسجيلُها كلّها يُغرق الجدول ولا يضيف خبرًا.
  if (select count(*) from public.failure_events
       where at > now() - interval '1 hour') >= 500 then
    return;
  end if;

  -- (٣) فرعٌ لا وجود له يسقط إلى NULL بدل أن يُسقط القيد. المسجِّل يُنادى من
  --     مسار ضيفٍ حيّ، وخطأُ مفتاحٍ أجنبيّ هنا كان سيتحوّل إلى ٥٠٠ لضيفٍ
  --     عطبُه الأصليّ أخفّ — أي أن يصير التسجيلُ نفسه عطلًا.
  if p_branch_id is not null
     and not exists (select 1 from public.branches where id = p_branch_id) then
    p_branch_id := null;
  end if;

  insert into public.failure_events (kind, path, code, branch_id, detail)
  values (
    p_kind,
    left(nullif(coalesce(p_path, ''), ''), 200),
    left(nullif(coalesce(p_code, ''), ''),  40),
    p_branch_id,
    coalesce(p_detail, '{}'::jsonb)
  );

  -- (٤) تنظيفٌ انتهازيّ خفيف — نفس نمط check_rate، بلا وظيفة كرون جديدة.
  --     ثلاثون يومًا تكفي لتمييز نمطٍ متكرّر من حادثةٍ عابرة.
  if random() < 0.01 then
    delete from public.failure_events where at < now() - interval '30 days';
  end if;

exception when others then
  -- التسجيل لا يُسقط طلبَ ضيفٍ أبدًا. نفس قرار /api/client-error حرفيًّا:
  -- «فشل الإبلاغ لا يستحق ٥٠٠». وهذه آخر شبكةٍ خلف الحارسين أعلاه.
  return;
end;
$function$;

-- لا يُنادى من متصفّح: الكتابة تمرّ من خادمنا بمفتاح الخدمة (guestWriter)،
-- تمامًا كـlog_client_error الذي لا يملك anon تنفيذه.
revoke all on function public.log_failure_event(text, text, text, uuid, jsonb)
  from public, anon, authenticated;

-- خطّ أساس q20: +١ جدول (٣٥←٣٦) · +١ دالّة (١٤٣←١٤٤) · +١ مفتاح أجنبيّ (٤٣←٤٤).
-- والسياسات ٧٣ كما هي — الجدول مختومٌ بلا سياسة.
--
-- تحديثٌ عمديّ وموثَّق لا إسكاتُ فحص (الميثاق §٢-٥). ورفعُه هنا لا في ترحيلٍ
-- لاحق: ٠١٦٩ رفع عدّادين ونسي اثنين فسقط q20 فور التطبيق على الإنتاج، وصحّحه
-- ٠١٧١ بعد أن صار أحمر. ولهذا يفشل هذا الإحلال صراحةً إن لم يجد مرتكزه.
do $mig$
declare v_def text; v_before text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='run_critical_checks';
  if v_def is null then raise exception 'run_critical_checks غير موجودة'; end if;

  v_before := v_def;
  v_def := replace(v_def, E'and c.relkind=\'r\') = 35',  E'and c.relkind=\'r\') = 36');
  v_def := replace(v_def, E'and p.prokind=\'f\') = 143', E'and p.prokind=\'f\') = 144');
  v_def := replace(v_def, E'and c.contype=\'f\') = 43)', E'and c.contype=\'f\') = 44)');

  if v_def = v_before then
    raise exception 'لم يُطابَق أيّ مرتكز في q20 — راجع أرقام الأساس قبل المتابعة';
  end if;

  execute v_def;
end
$mig$;
