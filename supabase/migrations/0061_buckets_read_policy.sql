-- 0061: الجذر الحقيقي لفشل رفع الصور كلها.
-- storage.buckets عليه RLS بلا أي سياسة — فكل مستخدم (متصفحًا أو خادمًا)
-- يفشل في خطوة «اقرأ الحاوية» قبل الرفع أصلًا: Bucket not found → 400
-- لكل صورة من كل حساب. القراءة العامة للملفات كانت تعمل (CDN) فبدا كل
-- شيء سليمًا إلا الرفع. أُثبت الإصلاح بانتحال حساب المالك داخل RLS:
-- قراءة الحاوية + إدخال صف رفع نجحا.
create policy "authenticated read media bucket"
  on storage.buckets for select
  to authenticated
  using (id = 'media');
