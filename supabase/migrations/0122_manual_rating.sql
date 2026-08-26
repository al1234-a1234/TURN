-- ٠١٢٢ — تقييمٌ يدويّ يكتبه المالك (بدل مزامنة قوقل ماب)
--
-- طُلبت مزامنة تقييم قوقل ماب آليًّا — وهي تحتاج مفتاح Google Places API
-- لا يملكه المشغّل الآن. قراره الصريح: «خل حقل المالك يقدر يضيفه التقييم
-- هو وذمته» — حقلٌ يدويّ يُعرض في الرئيسية وصفحة المطعم، ويتقدّم على
-- متوسط تقييمات المنصّة الداخلية (القليلة حاليًا) متى ما ضُبط.
--
-- صلاحية العمود صريحة: منح restaurants على مستوى الأعمدة منذ 0092،
-- والعمود الجديد لا يرث شيئًا — بلا هذا المنح تسقط قراءته صامتةً للزائر.

alter table public.restaurants
  add column if not exists manual_rating numeric(2,1)
  constraint restaurants_manual_rating_range check (manual_rating is null or (manual_rating >= 0 and manual_rating <= 5));

grant select (manual_rating) on public.restaurants to anon, authenticated;
