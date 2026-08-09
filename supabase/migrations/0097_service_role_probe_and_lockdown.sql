-- مِسبار دور الخدمة — لأنّ حارسي فحص الحضور لا الصلاحية.
--
-- ما جرى: `/api/health` كان يقول `writer: true` إذا كان المتغيّر
-- `SUPABASE_SERVICE_ROLE_KEY` غير فارغ. فمرّت البوّابة، ثم طُبِّق 0093،
-- فانكسر `/api/my-status` بـ«permission denied for function
-- guest_status_by_phone» — أي أنّ النداء وصل القاعدة بدور الضيف لا بدور
-- الخدمة: المتغيّر موجودٌ وقيمتُه ليست مفتاح خدمة.
--
-- والدرس هو درس هذه الجلسة كلّها، عاد عليّ: بوّابةٌ تفحص وجود شيءٍ بدل
-- أن تختبر عملَه ليست بوّابة. ولذلك تُختبر الآن بمسبارٍ حقيقيّ: دالّةٌ
-- لا يملك تنفيذها إلا `service_role`. إن نجح النداء فالمفتاح مفتاح خدمة
-- يقينًا؛ وإن فشل فالجواب `writer: false` — وهو الصدق.
create or replace function public.service_role_probe()
returns boolean language sql immutable security invoker set search_path to '' as $function$
  select true;
$function$;

revoke execute on function public.service_role_probe() from public, anon, authenticated;
grant  execute on function public.service_role_probe() to service_role;

-- ‏search_path متغيّر في دالّة كتبتُها اليوم (كشفه مدقّق Supabase). دالّةٌ
-- بلا مسارٍ مثبَّت تُستدرج إلى جدولٍ أو دالّةٍ يزرعها المهاجم في مخطّطٍ
-- يسبق public.
create or replace function public.admin_audit_immutable()
returns trigger language plpgsql set search_path to '' as $function$
begin
  raise exception 'سجلّ التدقيق لا يُعدَّل ولا يُحذف' using errcode = 'P0433';
end $function$;

-- خمس نقاط نهايةٍ مكشوفةٍ للإنترنت بلا مستدعٍ واحدٍ في المشروع (فحصتُ
-- الأربعة عشر ملفًّا). اثنتان منها داخليّتان تستدعيهما دوالٌّ أخرى — وهي
-- ‏SECURITY DEFINER فتعمل بصلاحية مالكها ولا تحتاج منح المستدعي.
-- وكلّ نقطةٍ مكشوفةٍ بلا حاجة سطحُ خطرٍ مجّاني.
--
-- ولم أمسّ تسع دوالٍّ أخرى نبّه عليها المدقّق: `is_platform_admin`
-- و`staff_has_perm` و`can_access_branch` وأخواتها. اختبرتُ سحب واحدةٍ
-- منها داخل معاملةٍ تُلغى فانكسرت القراءة العامّة كلّها بـ42501: سياسات
-- ‏RLS تفحص صلاحية التنفيذ على مستدعيها. فاتّباع نصيحة المدقّق حرفيًّا
-- كان سيُسقط الموقع.
revoke execute on function public.active_waitlist_counts()        from public, anon, authenticated;
revoke execute on function public.waitlist_counts(uuid)           from public, anon, authenticated;
revoke execute on function public.branch_busy_hours(uuid)         from public, anon, authenticated;
revoke execute on function public.caller_branch_id(uuid)          from public, anon;
revoke execute on function public.valid_branch_zone(uuid, text)   from public, anon;
