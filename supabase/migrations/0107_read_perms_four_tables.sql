-- ════════════════════════════════════════════════════════════════════════════
--  الصلاحيّة تحكم القراءة أيضًا — أربعة جداول
--
--  0106 أصلح الكتابة على الطابور والحجوزات. وبقي في الجرد تسع سياسات قراءةٍ
--  تفحص الانتماء وحده: «هل أنت موظّفٌ هنا؟» لا «هل تملك هذه الصلاحيّة؟».
--  ثلاثٌ منها عامّةٌ بالتصميم (المطاعم والفروع وساعات العمل — المجهول يقرؤها
--  بحقّ)، واثنتان تُركتا عمدًا: `tables` لأنّ المضيف يحتاج رؤية الطاولات
--  ليُجلس الناس، و`restaurant_features` لأنّ أعلام الميزات تبني الواجهة نفسها
--  فحجبها يُفرِغ اللوحة بيضاء. تبقى أربعٌ تُشدَّد هنا.
--
--  والقياس قبل التشديد: موظّفٌ كلّ صلاحيّاته false كان يقرأ ٢٣ ملفَّ عميل
--  (زيارات وملاحظات ووسم VIP ومحظور)، و٦ صفوف موظّفين بخرائط صلاحيّاتهم،
--  و٣٠ صفَّ إحصاءات. لا شيء من ذلك عابرٌ للمستأجرين — لكنّه يتجاوز ما مُنح.
--
--  ⚠ الفخّ الذي كاد يوقعنا في عطلٍ كامل: `staff` تقرؤها بوّابة الدخول نفسها.
--  `guard.ts` و`owner-context.ts` و`reception` و`partners` كلّها تسأل هذا
--  الجدول «من أنا؟» بـ user_id = auth.uid(). فاشتراط صلاحية `team` لقراءته
--  يمنع كلّ من لا يملكها من معرفة نفسه — أي تسقط اللوحة والاستقبال لكلّ
--  مضيفٍ في المنصّة. لذلك تبقى قراءة صفّك أنت مفتوحةً بلا شرط، والصلاحيّة
--  تحكم قراءة صفوف الآخرين وحدها.
--
--  ومسبقًا في الكود (يُنشر قبل هذا الترحيل): لوحة النظرة العامّة والتقارير
--  تسألان عن الصلاحيّة قبل الجلب، وتكتبان «لا تملك صلاحية» مكان الرقم. لأنّ
--  RLS يردّ صفرًا لا خطأً، وصفرٌ في لوحة المالك يُقرأ «ما عندك عملاء» —
--  كذبةٌ أخطر من المنع الظاهر.
-- ════════════════════════════════════════════════════════════════════════════

-- ── ١) customer_restaurant — ملفّات العملاء ────────────────────────────────
--
-- الكتابة كانت محروسةً بـ`customers` والقراءة مفتوحةً لأيّ موظّف — تناقضٌ
-- في الجدول نفسه. ولا نحتاج سياسةً جديدة: سياسة «managers manage customer
-- profiles» من نوع ALL وتغطّي SELECT بالشرط الصحيح أصلًا. فيكفي إسقاط
-- السياسة الواسعة، ويبقى للعميل قراءةُ ملفّه هو.

drop policy if exists "staff reads customer profiles" on public.customer_restaurant;

-- ── ٢) staff — دفتر الفريق ────────────────────────────────────────────────
--
-- صفّك أنت أوّلًا وبلا شرط (وإلّا انكسر الدخول)، ثمّ صفوف الآخرين بصلاحية
-- `team` وداخل فرعك. و«managers manage team» و«platform_admin_all» باقيتان
-- تغطّيان المدير والأدمِن.

drop policy if exists "staff read team" on public.staff;

create policy "staff read team" on public.staff
  for select using (
    user_id = (select auth.uid())
    or (public.staff_has_perm(restaurant_id, 'team')
        and (branch_id is null or public.can_access_branch(branch_id)))
  );

-- ── ٣) daily_stats — أرقام الفرع ──────────────────────────────────────────
-- لا قارئ لها في الواجهة اليوم، فالتشديد دفاعٌ في العمق بلا أثرٍ على شاشة.

drop policy if exists "staff reads own daily stats" on public.daily_stats;

create policy "staff reads own daily stats" on public.daily_stats
  for select using (
    branch_id = any (coalesce((select public.my_branch_ids_for('analytics')), array[]::uuid[])));

-- ── ٤) notifications — سجلّ ما أُرسل للعملاء ──────────────────────────────
-- كذلك بلا قارئ في الواجهة. وصلاحية الطابور هي الأقرب: من يدير الطابور
-- يحتاج أن يعرف هل وصل التنبيه.

drop policy if exists "staff reads notifications" on public.notifications;

create policy "staff reads notifications" on public.notifications
  for select using (
    branch_id = any (coalesce((select public.my_branch_ids_for('waitlist')), array[]::uuid[])));
