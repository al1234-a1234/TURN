-- ٠١٢٠ — قفل دالتَي التنبيهات عن anon وauthenticated

-- notify_telegram(p_message) وsend_platform_alerts() أُنشئتا خارج هذا
-- المستودع (منظومة المراقبة الموازية المكتشفة الليلة) وورثتا منح EXECUTE
-- الافتراضي للمشروع — فصار أي حامل مفتاحٍ علني قادرًا على إرسال رسائل
-- عشوائية إلى تيليجرام المشغّل عبر /rest/v1/rpc/notify_telegram، أو
-- تفجير فحوص التنبيه متى شاء. كشفها فاحص أمان Supabase (advisors).
--
-- تحقّق ما قبل السحب (درس حادثة ٠١١١-٠١١٤/٠١١٧ حرفيًّا):
--   * لا سياسة RLS واحدة تذكر أيًّا منهما (فحص qual/with_check بـregex
--     على كل pg_policies، شمل roles={public}).
--   * لا استدعاء من كود التطبيق إطلاقًا (grep صفر نتائج).
--   * المستدعي الوحيد: مهمة كرون platform-health-alerts وتعمل بدور
--     صاحب المهمة (postgres) — لا يمسّه هذا السحب.

revoke execute on function public.notify_telegram(text) from public, anon, authenticated;
revoke execute on function public.send_platform_alerts() from public, anon, authenticated;
