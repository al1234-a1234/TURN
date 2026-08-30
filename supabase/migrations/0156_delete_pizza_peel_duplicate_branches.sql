-- ============================================================================
--  حذف الفروع المكرّرة المعطّلة لـPizza peel — ٨ صفوف بعينها.
--
--  ⛔ غير مطبَّق. ينتظر إذن المالك الصريح (حذف بيانات إنتاج — خطٌّ أحمر).
--  اقرأ «ماذا سيُحذف بالضبط» أدناه قبل أن تأذن — هذا هو الغرض من الملفّ.
--
--  ── تصحيحٌ لعدّي في الطلب ──
--  وُصفت الفروع بـ«ثمانية، سبعة مكرّرة». الفعليّ على الإنتاج: **تسعة فروعٍ
--  إجمالًا لـPizza peel — واحدٌ نشِطٌ حقيقيّ، وثمانيةٌ مكرّرة معطّلة**. رقمان
--  مختلفان عمّا وُصف، والفرق قد يكون عدًّا شفهيًّا سريعًا. الرقم أدناه هو
--  ناتج استعلامٍ حيّ على الإنتاج الآن، لا افتراضًا.
--
--  ── ماذا سيُحذف بالضبط ──
--
--  الفرع الحقيقيّ (**لا يُمسّ**، ليس في قائمة الحذف):
--    a5af30ad-2d87-44be-949b-9768d5ca3a35  «الفرع الرئيسي»  Buraidah
--    نشِط · ٥٨ صفًّا في waitlist_entries · أنشئ ٢٦ أغسطس ٢١:٥٤
--
--  الثمانية المحذوفة — كلّها معطّلة (is_active = false) مسبقًا، بلا أيّ
--  بياناتٍ حيّة (تحقّقتُ في كلّ جدولٍ يشير إلى branches بمفتاحٍ أجنبي:
--  waitlist_entries · reservations · menu_categories/items · daily_stats ·
--  notifications · reviews · staff · tables — **صفرٌ في كلّها**):
--
--    ce6a77c6-61c3-4846-876f-30ec6f10b811  "Pizza peel"  بريدة  ٠٣:٠٥:٣٢
--    afc5e670-bcba-4b6d-9e9a-f123ba7dfbd8  "Pizza peel"  بريدة  ٠٣:٠٥:٣٣
--    7fabfde7-6f41-4616-ba5c-cf7b4281f82f  "Pizza peel"  بريدة  ٠٣:٠٥:٣٤
--    ffea4abf-8868-4059-9cec-7208203101bd  "Pizza peel"  بريدة  ٠٣:٠٥:٣٥
--    344c292c-ec84-4070-b722-e97686582507  "Pizza peel"  بريدة  ٠٣:٠٥:٣٦
--    fa42f58c-4f58-4918-b7a3-c85a4b3594c7  "Pizza peel"  بريدة  ٠٣:٠٥:٣٧
--    0755c0fd-bacd-449e-b8a8-87ffa1ec6855  "G"           H      ٠٣:١٢:٠٩
--    5f742023-26dc-4ed2-9e7f-f7d049833c7d  "G"           H      ٠٣:١٢:١٠
--
--  كلّها ٢٩ أغسطس ٢٠٢٦، وكلّها لثانيةٍ واحدة تفصل كلّ صفّين — ضغطٌ متكرّر
--  على الزرّ نفسه، لا فروعٌ حقيقيّة بأسماء حقيقيّة.
--
--  ما سيُحذف معها تلقائيًّا بـON DELETE CASCADE (فحصتُ كلّ جدولٍ، والعدد
--  الحقيقيّ لا افتراضيّ):
--    branch_settings  ٨ صفوف (صفٌّ واحدٌ لكلّ فرع — إعداداته الافتراضيّة)
--    branch_zones     ١٦ صفًّا (قسمان افتراضيّان لكلّ فرع عند إنشائه)
--  وكلّ جدولٍ آخر يشير إلى branches: **صفر صفوف** لهذه الثمانية تحديدًا.
--  `reviews.branch_id` وحدها `ON DELETE SET NULL` لا CASCADE — لا أثر، إذ
--  الصفوف صفرٌ أصلًا.
--
--  ── لماذا حذفٌ صلبٌ لا ناعم ──
--  هذه الثمانية معطّلةٌ (`is_active=false`) أصلًا منذ إنشائها — الحذف
--  الناعم مطبَّقٌ عليها فعلًا ولم يحلّ شيئًا؛ تبقى تظهر في أيّ استعلامٍ إداريّ
--  يعدّ فروع المطعم (٩ بدل ١). ولا تاريخ يُفقَد: صفرُ صفوفٍ في كلّ جدول
--  بيانات، فلا قيمة «التاريخ الذي نبيعه للمالك» (تعليق `deleteBranch`) تنطبق
--  هنا — هذه صفوفٌ لم تُستعمل يومًا واحدًا.
--
--  ── حارسا الأمان في الترحيل نفسه ──
--  المعرّفات مكتوبةٌ صراحةً (لا شرطٌ عامّ كـ«كلّ فرعٍ معطّل لـPizza peel»،
--  فمطعمٌ قد يعطّل فرعًا حقيقيًّا يومًا ما بقرارٍ مشروع). وقبل الحذف تأكيدٌ:
--  العدد ٨ بالضبط، وكلّها `is_active=false`، وكلّها بلا بياناتٍ حيّة — وإلا
--  يتوقّف الترحيل بخطأ صريح بدل حذفٍ أعمى.
-- ============================================================================

do $mig$
declare
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
  v_deleted int;
begin
  select count(*) into v_found
    from public.branches
   where id = any(v_ids) and is_active = false
     and restaurant_id = (select id from public.restaurants where slug = 'pizza-peel');
  if v_found <> array_length(v_ids, 1) then
    raise exception 'توقّع % صفًّا معطّلًا بهذه المعرّفات، وُجد %. توقّفٌ أمانًا — لا حذف.',
      array_length(v_ids, 1), v_found;
  end if;

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
  if v_deleted <> array_length(v_ids, 1) then
    raise exception 'حُذف % صفًّا لا %.', v_deleted, array_length(v_ids, 1);
  end if;

  raise notice 'حُذفت % فروعٍ معطّلة بلا بيانات — الفرع النشِط لم يُمسّ.', v_deleted;
end
$mig$;

-- المتوقَّع بعد التطبيق: فروع Pizza peel = 1 (كانت 9) · run_critical_checks
-- بلا تغيير في العدد (لا فحصٌ يعتمد على عدد فروع مطعمٍ بعينه).
