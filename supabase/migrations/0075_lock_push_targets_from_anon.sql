-- سحب دوال أهداف الإشعار من الضيف المجهول.
--
-- كانت `queue_push_targets_after_ticket_cancel` تكتفي بمعرّف صفٍّ ملغىً خلال
-- دقيقتين — بلا رقم جوّال — ثم تُعيد بيانات اشتراك الإشعار لكل من في الفرع.
-- والشرط يصنعه المهاجم بنفسه: `cancel_by_ticket` مفتوحة بنفس المعرّف وحده.
-- فمن يملك تذكرةً حيّة يُلغيها ثم يجمع بصمات أجهزة الطابور كلّه.
--
-- لا يستطيع إرسال إشعارٍ بها (Web Push يشترط توقيع VAPID)، لكن `endpoint`
-- معرّفٌ ثابت للجهاز يُتتبَّع به العميل عبر الزيارات والمطاعم.
--
-- الخادم صار يستدعيهما بمفتاح الخدمة، فلم يبقَ للضيف حاجةٌ بهما.
-- شرط التطبيق: ضبط SUPABASE_SERVICE_ROLE_KEY في Vercel وإعادة النشر — وإلّا
-- سقط المسار إلى عميل anon فانقطعت إشعارات «تقدّم دورك» بصمت.

REVOKE ALL ON FUNCTION public.queue_push_targets_after_cancel(uuid, text)
  FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.queue_push_targets_after_ticket_cancel(uuid)
  FROM anon, authenticated, public;

-- الخادم وحده — و`service_role` لا يمرّ بـPostgREST من المتصفّح أبدًا
GRANT EXECUTE ON FUNCTION public.queue_push_targets_after_cancel(uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.queue_push_targets_after_ticket_cancel(uuid)
  TO service_role;
