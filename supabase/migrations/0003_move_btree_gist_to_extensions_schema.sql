-- ============================================================
--  نقل إضافة btree_gist من schema public إلى extensions
--  (يعالج تحذير extension_in_public من مدقّق Supabase)
--  قيد no_double_booking يظل صالحًا لأنه يرتبط بمعرّف صنف
--  المعاملات (operator class) وليس باسم الـ schema.
-- ============================================================
alter extension btree_gist set schema extensions;
