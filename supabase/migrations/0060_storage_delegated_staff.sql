-- 0060: سياسات التخزين تقبل الموظّف المفوَّض — إكمال لما بدأه 0058.
-- 0058 واءم سياسات القائمة/الإعدادات/الطاولات مع الصلاحيات المفوَّضة،
-- لكن حاوية الصور بقيت تشترط مديرًا: موظّف بصلاحية «الإعدادات» يفتح
-- شاشات الرفع ويفشل رفعه بصمت. المواءمة نفسها هنا.
alter policy "managers upload media" on storage.objects
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'restaurants'
    and (
      is_manager_of(((storage.foldername(name))[2])::uuid)
      or staff_has_perm(((storage.foldername(name))[2])::uuid, 'settings')
    )
  );

alter policy "managers update media" on storage.objects
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'restaurants'
    and (
      is_manager_of(((storage.foldername(name))[2])::uuid)
      or staff_has_perm(((storage.foldername(name))[2])::uuid, 'settings')
    )
  );

alter policy "managers delete media" on storage.objects
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'restaurants'
    and (
      is_manager_of(((storage.foldername(name))[2])::uuid)
      or staff_has_perm(((storage.foldername(name))[2])::uuid, 'settings')
    )
  );
