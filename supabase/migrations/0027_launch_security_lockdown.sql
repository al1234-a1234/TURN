-- ============================================================================
--  إقفال ما قبل الإطلاق: دوال بلا حارس داخلي كانت متاحة عبر REST لأي زائر.
--  الأخطر: demo_live_activity — مولّد بيانات وهمية بلا حارس؛ استدعاء REST واحد
--  من مجهول كان يكفي لإغراق الإنتاج. ودوال الكرون الأربع مثلها.
--  الكرون يعمل بدور postgres فلا يتأثر بالسحب.
--  دوال المساعدة (is_staff_of وأخواتها) تُترك متاحة عمدًا: سياسات RLS تستدعيها
--  أثناء تقييم استعلامات الزوّار، وسحبها يكسر القراءة العامة.
-- ============================================================================
revoke execute on function public.demo_live_activity() from anon, authenticated;
revoke execute on function public.rollup_daily_stats(uuid, date) from anon, authenticated;
revoke execute on function public.rollup_all_daily_stats(date) from anon, authenticated;
revoke execute on function public.run_daily_digest() from anon, authenticated;
revoke execute on function public.run_slow_hours() from anon, authenticated;
revoke execute on function public.create_restaurant_with_branch(text, text, text, text, text, text, text, text) from anon, authenticated;
revoke execute on function public.gen_claim_code() from anon, authenticated;
revoke execute on function public.grant_reward_to_segment(uuid, text, text, text, numeric, text, text, text, timestamptz) from anon;
revoke execute on function public.set_staff_permission(uuid, text, boolean) from anon;
