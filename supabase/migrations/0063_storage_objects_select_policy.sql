-- 0063: سياسة قراءة على storage.objects — الجذر المثبَت لتعذّر كل رفع صورة.
-- الدليل (سجلّات postgres + إعادة تمثيل حرفية بحساب المالك نفسه):
--   * إدراج بسيط في storage.objects → ينجح.
--   * إدراج بصيغة upsert أي INSERT .. ON CONFLICT DO UPDATE — وهي الصيغة
--     التي يرسلها storage-api لأن الرفع عندنا بـ upsert:true — → يفشل بـ
--     «new row violates row-level security policy for table objects».
-- السبب: تحكيم التعارض في Postgres يشترط قراءةً تمرّ عبر سياسة SELECT،
-- والجدول لم يكن يحمل أي سياسة SELECT إطلاقًا (رفض ضمني) — فتعذّر الرفع
-- لكل الحسابات مهما بلغت صلاحياتها، بينما كانت كل مكوّنات سياسة الرفع
-- نفسها تُقيَّم صحيحة. النطاق هنا مطابق تمامًا لنطاق سياسة الرفع.
create policy "staff reads media objects" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'restaurants'
    and (
      is_manager_of(((storage.foldername(name))[2])::uuid)
      or staff_has_perm(((storage.foldername(name))[2])::uuid, 'settings')
    )
  );
