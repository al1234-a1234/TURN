-- 0054: صورة العرض — العرض الحيّ في الرئيسية يصير «بانر» بصورة يتحكّم بها
-- ناشر العرض (مثل بونات/كوينز)، لا بطاقة نصية جامدة.
alter table public.offers add column if not exists image_url text;
