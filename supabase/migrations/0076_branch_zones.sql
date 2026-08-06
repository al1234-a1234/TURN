-- أقسام الفرع: داخلي · خارجي · كلاهما — بقرار المالك لا بافتراضنا.
--
-- كانت «داخلي/خارجي» مثبَّتة في الكود في ستّة مواضع (نموذج انضمام العميل،
-- صندوق الاستقبال، إدارة الطاولات، شاشة الصالة…). فمطعمٌ داخليٌّ فقط كان
-- يعرض لعميله زرّ «طاولة خارجية»، فيختاره وينتظر طاولةً لا وجود لها — وهذا
-- عطبٌ في أول انطباع، وهو أغلى ما نملك أمام المنافس.
--
-- عَلَمان لا مصفوفة: الحاجة المعلنة هي داخلي/خارجي/كلاهما بالضبط، والعَلَمان
-- يمنعان حالاتٍ لا معنى لها (تكرار، قسم مجهول) بلا أي تعقيد. وأسماء أقسامٍ
-- مخصّصة — لو طُلبت لاحقًا — تغييرٌ أوسع يمسّ waitlist_entries.zone نفسه.
--
-- والقيد يمنع إطفاءهما معًا: فرعٌ بلا أي قسم يعني عميلًا لا يستطيع اختيار
-- شيء — أي طابورًا معطّلًا بصمت من إعدادٍ يبدو بريئًا.

ALTER TABLE public.branch_settings
  ADD COLUMN has_inside  boolean NOT NULL DEFAULT true,
  ADD COLUMN has_outside boolean NOT NULL DEFAULT true;

ALTER TABLE public.branch_settings
  ADD CONSTRAINT branch_settings_zone_at_least_one
  CHECK (has_inside OR has_outside);

COMMENT ON COLUMN public.branch_settings.has_inside  IS 'الفرع يملك طاولات داخلية';
COMMENT ON COLUMN public.branch_settings.has_outside IS 'الفرع يملك طاولات خارجية';
