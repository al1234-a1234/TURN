-- ═══ عطلٌ حرج: من أُرجع دورُه يبقى يقرأ «تم إلغاء دورك» إلى الأبد ═══
--
-- ما يحدث للضيف: ينضمّ، يلغي، يُرجعه الاستقبال — وشاشتُه تبقى «تم إلغاء
-- دورك». يخرج من الصفحة ويعود برابط تذكرته: **ما زالت ملغاة**. فيظنّ أنّه
-- خارج الطابور وينصرف، ومكانُه محجوزٌ في الاستقبال. أسوأ من عطلٍ ظاهر.
--
-- ══ السبب — من الشيفرة لا من التخمين ══
-- `restore_queue_entry` **لا تُرجع الصفّ القديم**. تُنشئ صفًّا جديدًا:
--     insert into public.waitlist_entries (...) returning id into v_new_id;
-- وتترك القديم على `cancelled` كما هو (وهذا مقصود: الترقيم والقفل
-- وEXCLUDE كلّها مبنيّةٌ على صفٍّ جديد، ولا يُعاد فتح ذلك هنا).
--
-- والتذكرة تقرأ بالمُعرّف المباشر وحده:
--     waitlist_ticket_by_id   … where w.id = p_entry_id
--     waitlist_ticket_status  … where w.id = p_entry_id
-- والضيف يحمل **المُعرّف القديم**. فيقرأ الصفّ الملغى إلى الأبد.
--
-- ══ الأثر المقيس على الإنتاج الآن ══
-- ١١ عمليّة إرجاعٍ في التاريخ كلّه، و**١١ تذكرةً قديمةً عالقة** — أي أنّ
-- كلّ إرجاعٍ جرى منذ إطلاق الميزة خلّف ضيفًا يقرأ حالةً خاطئة. ومنها
-- إعادةُ إنتاج المالك قبل دقائق:
--   ٠٥:٣٩:١٠  eficto  قديم 6b575095…=cancelled → جديد 56caec4c…=waiting
--   ٠٥:٣٧:٢٠  eficto  قديم bca070e2…=cancelled → جديد b85410f8…=waiting
--
-- وفي البيانات **سلاسل** لا خطوةٌ واحدة (إرجاعٌ بعد إرجاع):
--   a74ad229 → d841dc9e → 5ccfd8f3      و     439bee16 → ef12e9ff → de8bb0d3
-- فالحلّ لا بدّ أن يكون تتبّعًا متعدّيًا لا قفزةً واحدة.
--
-- ══ هل هذا انحدارٌ من ترحيلات اليوم؟ لا ══
-- ٠١٩٠ يمسّ هاتف الطُّعم وحده، و٠١٩٢ يمسّ مخطّط امتداد http وحده، وأقدم
-- تذكرةٍ عالقة من ٢٠٢٦-٠٨-٣١ — قبلهما. والعطل بنيويّ في تصميم الإرجاع.
-- وأمّا ٠١٩٤ (الذي حذف صفوفًا) فلم يمسّ ضيفًا واحدًا، بضمانتين مستقلّتين:
--   ١) waitlist_entries_customer_id_fkey قيدُه ON DELETE **RESTRICT**، فالقاعدة
--      نفسها تمنع حذف عميلٍ له صفُّ طابور — لا اعتمادًا على شرطٍ كتبناه.
--   ٢) نصّ prune_canary_artifacts فيه جملتا حذفٍ اثنتان فقط (queue_events
--      وcustomers)، وwaitlist_entries لا ترد فيه إلّا داخل `not exists`.
--   والقياس بعده: ٤٣١ صفَّ طابور، **صفر صفٍّ يتيم**، وأحداث الإرجاع الـ١١
--   سليمةٌ كلّها (المحذوف كان ١٤٩ حدثًا نوعُها cancelled لعملاء الطُّعم).
--
-- ══ العلاج ══
-- النسب مُسجَّلٌ أصلًا منذ ٠١٧٥: كلّ إرجاعٍ يكتب حدثًا kind='restored'
-- فيه entry_id = الجديد وdetail->>'restored_from' = القديم. فلم يبقَ إلّا
-- أن تتبعه التذكرة. دالّةٌ واحدة تتبع السلسلة إلى آخرها، وتُستعمل في
-- الدالّتين. لا تغييرَ في الواجهة ولا في المكوّنات ولا في تصميم الإرجاع.
--
-- ══ ما لا يعالجه هذا الترحيل — بصراحة ══
-- الاستطلاع في المتصفّح يتوقّف عند الحالة النهائيّة:
--   ticket-view.tsx:57  و  queue-ticket.tsx:186   `if (TERMINAL…) stopped = true`
-- فبعد الإلغاء لا ينبض شيء، والإرجاع لا يصل إلى شاشةٍ مفتوحة **بلا
-- تحديث**. هذا الترحيل يُصلح إعادة الدخول والتحميل (وهو ما يفعله الضيف
-- فعلًا)، أمّا البثّ الحيّ فيحتاج تغييرًا في الشيفرة يصل main ويُطلق نشرًا
-- إنتاجيًّا — موقوفٌ على إذنٍ صريح.
--
-- ══ فحصٌ أحمر قبل هذا الترحيل — ليس منه ══
-- المحاولة الأولى لتطبيق هذا الملفّ **رفضت نفسها ورجعت** لأنّ بوّابتها
-- تشترط شبكةً خضراء، و`w23_no_branch_open_24h` كان راسبًا. وليس من صنعنا:
--   قياسي الكامل ٢٢٤/٢٢٤ أخضر الساعة ٠٥:١٧
--   branch_settings لفرع Eficto عُدِّل ٠٥:٣٥:٤٣ ← بيدِ إنسان من اللوحة
--   ثمّ إعادةُ إنتاج المالك للعطل ٠٥:٣٧ و٠٥:٣٩
-- والسبب أنّ ساعات العمل صارت ٢١ ساعةً في كلّ يومٍ من السبعة، والحارس
-- يصرخ فوق ٢٠. فهو يعمل كما ينبغي: إعدادٌ بشريٌّ يستحقّ نظرة المالك.
--
-- ولذلك البوّابة هنا **لا تُضعَّف ولا يُسكَت حارس**: تُلتقط قائمة الراسب
-- قبل التغيير، ويُشترط ألّا يزيد عليها شيءٌ بعده. أي «لا انحدار» بدل «كلّه
-- أخضر» — وهو الشرط الصحيح حين يكون الأحمر سابقًا للتغيير وخارجًا عنه.
--
-- التراجع: 0197_ROLLBACK_ticket_restore_lineage.sql (مكتوبٌ قبل هذا الملفّ)

-- ٠) خطُّ الأساس: ما هو راسبٌ **قبل** أن نلمس شيئًا
create temporary table if not exists _pre_fail on commit drop as
  select name from public.run_critical_checks() where not pass;

-- ١) تتبّع النسب. المقارنة نصّيّة لا بتحويلٍ إلى uuid: قيمةٌ مشوّهةٌ في
--    detail تُسقط التذكرة كلّها لو حوّلنا، والتذكرة أهمّ من أناقة النوع.
create or replace function public.effective_entry_id(p_entry_id uuid)
returns uuid language sql stable security definer set search_path to ''
as $function$
  with recursive chain(id, depth) as (
    select p_entry_id, 0
    union all
    select e.entry_id, c.depth + 1
      from chain c
      join public.queue_events e
        on e.kind = 'restored'
       and e.detail->>'restored_from' = c.id::text
     where c.depth < 10
  )
  select id from chain order by depth desc limit 1;
$function$;

revoke all on function public.effective_entry_id(uuid) from public, anon, authenticated;

comment on function public.effective_entry_id(uuid) is
  'يتبع سلسلة الإرجاع من مُعرّفٍ قديمٍ إلى الصفّ الحيّ الذي حلّ محلّه. مدخلها الدالّتان المعرّفتان أمنيًّا وحدهما — لا تُنادى من عميل.';

-- الفهرس: الجدول صغيرٌ اليوم (١٠٨ صفوف) لكنّ التتبّع يجري في كلّ فتحةِ
-- تذكرة. فهرسٌ جزئيّ على أحداث الإرجاع وحدها — لا على الجدول كلّه.
create index if not exists queue_events_restored_from_idx
  on public.queue_events ((detail->>'restored_from'))
  where kind = 'restored';

-- ٢) الدالّتان تقرآن الصفّ الفعليّ. استبدالٌ مرتكزٌ على شرط where وحده —
--    لا إعادة كتابةٍ للدالّة كي لا يعود انحرافٌ حيٌّ لا نعلمه.
do $mig$
declare r record; d text; d2 text; v_hits int;
begin
  for r in select unnest(array['waitlist_ticket_by_id','waitlist_ticket_status']) as fname
  loop
    select pg_get_functiondef(oid) into d from pg_proc
     where proname = r.fname and pronamespace='public'::regnamespace;
    if d is null then raise exception 'الدالّة % غير موجودة', r.fname; end if;

    v_hits := (length(d) - length(replace(d, 'where w.id = p_entry_id', ''))) / 23;
    if v_hits <> 1 then
      raise exception 'المرساة في % وردت % مرّة لا مرّةً واحدة — لا استبدالَ أعمى', r.fname, v_hits;
    end if;

    d2 := replace(d, 'where w.id = p_entry_id', 'where w.id = public.effective_entry_id(p_entry_id)');
    execute d2;
  end loop;
end $mig$;

-- ٣) q20: دالّةٌ واحدة جديدة  141 → 142
do $mig2$
declare d text; d2 text;
begin
  select pg_get_functiondef(oid) into d from pg_proc
   where proname='run_critical_checks' and pronamespace='public'::regnamespace;
  d2 := replace(d, 'and p.prokind=''f'') = 141', 'and p.prokind=''f'') = 142');
  if d2 = d then raise exception 'مرساة عدّاد الدوالّ (141) لم تُطابق'; end if;
  execute d2;
end $mig2$;

-- ٤) حارسٌ دائم w58: الدالّتان تتبعان النسب، ولا مُعرّفَ أُرجع منه يبقى
--    يحلّ إلى نفسه. الشرط الثاني يصحّ للسلاسل أيضًا: المطلوب أن يتحرّك
--    الحلّ عن القديم، لا أن يصل إلى خلفٍ بعينه.
do $mig3$
declare d text; d2 text; v_new text;
begin
  select pg_get_functiondef(oid) into d from pg_proc
   where proname='run_critical_checks' and pronamespace='public'::regnamespace;

  v_new :=
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

  d2 := replace(d, E'    (''q20_schema_no_drift'',', v_new || E'    (''q20_schema_no_drift'',');
  if d2 = d then raise exception 'مرساة q20 لم تُطابق'; end if;
  execute d2;
end $mig3$;

-- ٥) تحقّقٌ بعديّ على البيانات الحيّة: التذاكر الـ١١ العالقة تُحلّ الآن
do $verify$
declare v_fail text; v_w58 boolean; v_stranded int; v_moved int; v_anon boolean;
begin
  -- لا تذكرةَ مُرجَعٌ منها تبقى تحلّ إلى نفسها
  select count(*) into v_stranded
    from public.queue_events e
   where e.kind='restored' and e.detail ? 'restored_from'
     and public.effective_entry_id((e.detail->>'restored_from')::uuid)::text
         = e.detail->>'restored_from';
  if v_stranded <> 0 then raise exception 'بقيت % تذكرةً عالقة', v_stranded; end if;

  -- وكلّها تحلّ إلى صفٍّ موجودٍ فعلًا لنفس العميل
  select count(*) into v_moved
    from public.queue_events e
    join public.waitlist_entries old_w on old_w.id = (e.detail->>'restored_from')::uuid
    join public.waitlist_entries new_w on new_w.id = public.effective_entry_id(old_w.id)
   where e.kind='restored' and old_w.customer_id = new_w.customer_id;
  if v_moved < 11 then raise exception 'حُلّت % فقط من ١١ — أو حلّت لعميلٍ آخر', v_moved; end if;

  -- الدالّة الجديدة ليست مكشوفةً لـanon (وإلّا رسب w47)
  select has_function_privilege('anon','public.effective_entry_id(uuid)','EXECUTE') into v_anon;
  if v_anon then raise exception 'effective_entry_id مكشوفةٌ لـanon'; end if;

  select pass into v_w58 from public.run_critical_checks()
   where name='w58_ticket_follows_restore_lineage';
  if v_w58 is null then raise exception 'w58 لم يُضف'; end if;
  if not v_w58 then raise exception 'w58 راسب فور إضافته'; end if;

  -- لا انحدار: كلّ راسبٍ الآن كان راسبًا قبل التغيير
  select coalesce(string_agg(c.name,'، '),'—') into v_fail
    from public.run_critical_checks() c
   where not c.pass and c.name not in (select name from _pre_fail);
  if v_fail <> '—' then raise exception 'فحوصٌ رسبت بسبب هذا التغيير: %', v_fail; end if;

  raise notice 'راسبٌ سابقٌ لهذا التغيير (لم يُمسّ): %',
    (select coalesce(string_agg(name,'، '),'—') from _pre_fail);
end
$verify$;
