-- ═══ تراجع الموجة ١ (٠١٧٧) — يُطبَّق فقط إن ظهر عطل ═══
-- يعيد صلاحية التنفيذ لدوالّ التقرير اليوميّ إلى ما كانت عليه (المنح
-- الضمنيّ لـ PUBLIC الناتج عن CREATE FUNCTION).
grant execute on function public.snapshot_payload()                       to public;
grant execute on function public.report_flags(jsonb)                      to public;
grant execute on function public.report_since_label(text, jsonb)          to public;
grant execute on function public.report_window_change(text, jsonb, jsonb) to public;
grant execute on function public.daily_report_text(jsonb, jsonb, jsonb)   to public;
