-- شبكة الفحوص كشفت أن إقفال 0027 ناقص: الدوال ممنوحة لـ PUBLIC والدور anon
-- يرثه — فسحب anon وحده لا يقفل شيئًا. السحب هنا من PUBLIC نفسه.
revoke execute on function public.demo_live_activity() from public;
revoke execute on function public.rollup_daily_stats(uuid, date) from public;
revoke execute on function public.rollup_all_daily_stats(date) from public;
revoke execute on function public.run_daily_digest() from public;
revoke execute on function public.run_slow_hours() from public;
revoke execute on function public.create_restaurant_with_branch(text, text, text, text, text, text, text, text) from public;
revoke execute on function public.gen_claim_code() from public;
