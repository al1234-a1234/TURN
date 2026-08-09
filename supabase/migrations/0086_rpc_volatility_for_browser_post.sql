-- ═══════════════════════════════════════════════════════════════════
--  تصحيح وصف تقلّب الدوالّ التي يناديها المتصفّح.
--
--  (طُبِّق على الإنتاج باسم 0085_rpc_volatility_for_browser_post.)
--
--  السياق: كل نداء RPC من متصفّحٍ إلى Supabase كان يرجع 405 بينما ينجح
--  من خادمنا بنفس المفتاح والمسار. ولم يثبت لي السبب في طبقتهم، فعالجتُ
--  الأثر بتمرير النداءات عبر خادمنا (api/my-status و api/my-rewards).
--
--  وهذا الترحيل يصحّح شيئًا مستقلًّا اكتُشف في الطريق: دالّتان موصوفتان
--  STABLE وهما تكتبان فعلًا — تستدعيان check_rate التي تكتب في rate_limits.
--  وصفٌ خاطئ يُضلّل المخطِّط وأيّ طبقةٍ تبني عليه.
--
--  ولا نمسّ مساعدات RLS (is_staff_of، can_access_branch، is_platform_admin…):
--  تلك تُقيَّم لكل صفّ، وسكونها هو ما يجعل بوستجرس يحسبها مرّةً للجملة كلّها.
-- ═══════════════════════════════════════════════════════════════════

-- تصحيح وصفٍ خاطئ: هاتان تكتبان في rate_limits
alter function public.guest_status_by_phone(text)            volatile;
alter function public.rewards_by_phone(text)                 volatile;

-- نقاط نهاية يناديها المتصفّح — تُنادى مرّةً لكل طلب لا داخل حلقة،
-- فالخسارة في التحسين لا تكاد تُقاس
alter function public.waitlist_ticket_status(uuid, text)     volatile;
alter function public.waitlist_ticket_by_id(uuid)            volatile;
alter function public.waitlist_counts_for(uuid[])            volatile;
alter function public.waitlist_counts_by_zone(uuid[])        volatile;
alter function public.reservation_slots(uuid, date, integer, text) volatile;
alter function public.tv_queue(uuid)                         volatile;
alter function public.queue_version(uuid)                    volatile;

notify pgrst, 'reload schema';
