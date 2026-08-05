-- (أ) ضبط التنظيف التلقائي للجداول عالية الدوران.
--
-- عتبة Postgres الافتراضية نسبةٌ مئوية (٢٠٪ من الجدول) — أي أن الجدول كلّما كبر
-- ندر تنظيفه. مع ٢٥ ألف صفّ يوميًّا يصير waitlist_entries ٩ ملايين صفّ في سنة،
-- فيحتاج ١٫٨ مليون صفّ ميت قبل أن يستيقظ التنظيف. وبين الغفوتين تتضخّم الفهارس
-- الجزئية بالجثث — وهي نفسها الفهارس التي يقوم عليها ادّعاؤنا بأن «النمو لا يمسّ
-- المسار الحرج». (آخر تنظيف تلقائي وقت كتابة هذا: قبل أحد عشر يومًا.)
--
-- الحلّ عتبة شبه ثابتة بدل النسبة: ٢٪ + ٥٠٠ صفّ. فيبقى التنظيف على وتيرته مهما
-- كبر الجدول، بدل أن يتباعد كلّما زادت الحاجة إليه.

ALTER TABLE public.waitlist_entries SET (
  autovacuum_vacuum_scale_factor  = 0.02,
  autovacuum_vacuum_threshold     = 500,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_analyze_threshold    = 500
);

ALTER TABLE public.reservations SET (
  autovacuum_vacuum_scale_factor  = 0.02,
  autovacuum_vacuum_threshold     = 500,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_analyze_threshold    = 500
);

-- rate_limits: جدول صغير جدًّا (عشرات الصفوف) لكن كل انضمام يُحدّثه — أي أن
-- ٢٠٪ من ٥٧ صفًّا = ١١ تحديثًا فقط تكفي نظريًّا، لكنه يُحدَّث آلاف المرّات يوميًّا
-- فيتضخّم بالنسخ الميّتة بين التنظيفات. عتبة صغيرة ثابتة أنسب له.
ALTER TABLE public.rate_limits SET (
  autovacuum_vacuum_scale_factor  = 0.05,
  autovacuum_vacuum_threshold     = 50,
  autovacuum_analyze_scale_factor = 0.05,
  autovacuum_analyze_threshold    = 50
);

ALTER TABLE public.customers SET (
  autovacuum_vacuum_scale_factor  = 0.05,
  autovacuum_vacuum_threshold     = 500
);

ALTER TABLE public.customer_restaurant SET (
  autovacuum_vacuum_scale_factor  = 0.05,
  autovacuum_vacuum_threshold     = 500
);


-- (ب) آلة حالات الدور — منع إحياء دورٍ منتهٍ.
--
-- لا قيد في القاعدة يمنع اليوم انتقالًا غير منطقي: صفٌّ «جلس» أو «أُلغي» يمكن
-- أن يعود «ينتظر» بتحديثٍ واحد. مسار التطبيق محميّ أصلًا (updateWaitlistStatus
-- يستعمل «قارن ثم بدّل» عبر .in("status", allowedFrom))، لكن الطاقم يملك صلاحية
-- UPDATE مباشرة على الجدول عبر PostgREST — فالحماية في طبقة واحدة فقط.
--
-- والقيد هنا مقصود التضييق: يمنع الإحياء وحده (منتهٍ ← نشِط) ولا يمنع غيره.
-- تحقّقتُ قبل فرضه أن لا مسار مشروع يُحيي دورًا: الدوال الثلاث التي تغيّر الحالة
-- تكتب 'cancelled' أو 'expired' فقط، وواجهة اللوحة تكتب seated/cancelled/notified،
-- ولا شيء في المستودع يكتب 'waiting'. و«الإعادة التلقائية» في الكرون تخصّ أعلام
-- الفرع (branch_settings) لا الأدوار.
--
-- ملاحظة: seated ← cancelled يبقى مسموحًا عمدًا — اللوحة تستعمله فعلًا لتصحيح
-- إجلاسٍ خاطئ، وهو انتقال بين حالتين نهائيتين لا إحياء.

CREATE OR REPLACE FUNCTION public.guard_waitlist_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if old.status in ('seated','cancelled','expired','no_show')
     and new.status in ('waiting','notified') then
    raise exception
      'انتقال غير مسموح: % ← % (لا يُعاد إحياء دور منتهٍ)', old.status, new.status
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

DROP TRIGGER IF EXISTS trg_guard_waitlist_status ON public.waitlist_entries;
CREATE TRIGGER trg_guard_waitlist_status
  BEFORE UPDATE OF status ON public.waitlist_entries
  FOR EACH ROW
  WHEN (old.status IS DISTINCT FROM new.status)
  EXECUTE FUNCTION public.guard_waitlist_status_transition();
