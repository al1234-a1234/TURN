-- ============================================================================
--  عبور منتصف الليل: سبع دوالّ تُسقط عميلًا حيًّا عند تمام الساعة ١٢.
--
--  ── العطل، مُثبَتًا حيًّا لا نظريًّا (turn-simulation، بنسخٍ مطابقةٍ للإنتاج
--     بصمةً: confirm_attendance=27cc24c2… · cancel_by_ticket=2c5df6a8… ·
--     tv_queue=4ecc1149… · waitlist_ticket_by_id=2a499109…) ──
--
--  سبع دوالّ تحرس صفوف الطابور بمساواة **تاريخٍ تقويميّ**:
--      (w.joined_at at time zone 'Asia/Riyadh')::date
--        = (now() at time zone 'Asia/Riyadh')::date
--
--  وفرعٌ يفتح مساءً ويُغلق بعد منتصف الليل — وهو حال المطعم — يجعل عميلَ
--  الساعة ١١:٥٠ والساعة ١٢:٠١ يومين مختلفين رغم أنّهما نفس جلسة العمل.
--  فيسقط من انضمّ قبل منتصف الليل من كلّ هذه المسارات وهو ما زال `waiting`
--  في القاعدة، ويحتلّ موضعه في الطابور.
--
--  ثلاثة إثباتاتٍ حيّة على صفٍّ واحد، حالته `waiting` طوال الاختبار:
--    • tv_queue            : يعرضه قبل العبور (١) ويُسقطه بعده (٠)
--    • cancel_by_ticket    : يرجع false — العميل يضغط «ألغِ دوري» فلا شيء
--    • confirm_attendance  : يرجع false — يضغط «أنا قادم» فلا شيء
--    • waitlist_ticket_by_id: يعرض total=0 بينما العميل في الطابور
--  وكلّها تفشل **صامتةً**: لا خطأ، ولا سجلّ، ولا شيء يُنبّه أحدًا.
--
--  ── والخلل في الاتّجاهين، لا في اتّجاهٍ واحد ──
--  مصفوفة أوقاتٍ حقيقيّة قِيست بالاستعلام نفسه:
--    انضمّ ٢٣:٥٠ · الآن ٠٠:٣٠ (٤٠ دقيقة) ⇒ التقويميّ يُسقط عميلًا حيًّا 🔴
--    انضمّ ٢٠:٠٠ · الآن ٠١:٠٠ (٥ ساعات)  ⇒ يُسقط عميلًا حيًّا 🔴
--    انضمّ ١٠:٠٠ · الآن ٢٢:٠٠ (١٢ ساعة)  ⇒ يُظهر صفًّا بائتًا ⚠️
--  فالمعيار التقويميّ ليس متساهلًا ولا متشدّدًا — هو ببساطة يقيس الشيء الخطأ.
--
--  ── الإصلاح: نافذةٌ متدحرجة، وليست نافذةً اخترعتُها ──
--  `expire_stale_waitlist()` — الحارس الذي يُنهي الصفوف فعليًّا — يستعمل
--  `joined_at < now() - interval '8 hours'` شبكةَ أمانٍ أخيرة، وتعليقه يقول
--  صراحةً إنّه «يعالج النطاق الليليّ العابر لمنتصف الليل مجّانًا». فالحدّ
--  الصحيح موجودٌ في النظام منذ البداية، والدوالّ السبع كانت تخالفه بحارسٍ
--  ثانٍ زائد. فتُوحَّد عليه: `joined_at > now() - interval '8 hours'` —
--  مسار القراءة يوافق مسار الكتابة بدل أن يناقضه.
--
--  ولا يُعاد كتابة أيّ دالّة يدويًّا: يُقرأ تعريفها القائم ويُستبدل النمط
--  وحده بـregexp، فلا يتغيّر حرفٌ آخر. وحارسٌ يتوقّف إن لم تُصلَح ولا واحدة،
--  أو إن بقي بعدها أثرٌ للنمط القديم.
-- ============================================================================

do $mig$
declare
  r record; v_def text; v_new text; v_changed int := 0; v_left int := 0;
  c_pat constant text :=
    '\(([a-z0-9_]+)\.joined_at at time zone ''Asia/Riyadh''\)::date\s*=\s*\(now\(\) at time zone ''Asia/Riyadh''\)::date';
begin
  for r in
    select p.oid, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and p.proname in ('confirm_attendance','cancel_by_ticket','waitlist_ticket_by_id','tv_queue',
                         'queue_push_targets','queue_push_targets_after_cancel',
                         'queue_push_targets_after_ticket_cancel')
     order by p.proname
  loop
    v_def := pg_get_functiondef(r.oid);
    if v_def !~ c_pat then continue; end if;
    v_new := regexp_replace(v_def, c_pat, '\1.joined_at > now() - interval ''8 hours''', 'g');
    execute v_new;
    v_changed := v_changed + 1;
    raise notice 'أُصلحت: %', r.proname;
  end loop;

  select count(*) into v_left
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and pg_get_functiondef(p.oid) ~ c_pat;

  if v_changed = 0 then
    raise exception 'لم تُصلَح أيّ دالّة — النمط لم يُطابق. راجع يدويًّا قبل المتابعة.';
  end if;
  if v_left <> 0 then
    raise exception 'بقيت % دالّة على النمط التقويميّ بعد الإصلاح — توقّف.', v_left;
  end if;
  raise notice 'المجموع: % دالّة أُصلحت، ولا شيء متبقٍّ.', v_changed;
end
$mig$;

-- المتوقَّع بعد التطبيق: عميلٌ انضمّ ٢٣:٥٠ يبقى على الشاشة، ويستطيع التأكيد
-- والإلغاء، وتذكرته تعرض العدد الصحيح — حتى الساعة ٠٧:٥٠ (ثماني ساعات)،
-- وهي نفس اللحظة التي يُنهيه فيها expire_stale_waitlist. لا تعارض بينهما.
