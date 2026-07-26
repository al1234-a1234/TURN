-- ============================================================================
--  تشديد صلاحيات دوال الدفع.
--
--  المشكلة: Supabase تمنح anon صلاحية التنفيذ تلقائيًّا على كل دالة جديدة عبر
--  ALTER DEFAULT PRIVILEGES، و«revoke all ... from public» لا يزيل هذا المنح
--  الصريح — فبقيت دوال مقصودة للموظّفين متاحة للضيف.
--
--  الأخطر: delete_push_subscription بلا حارس داخلي. سلسلة الهجوم كانت مكتملة:
--  يلغي المهاجم دوره → يحصل على endpoints عبر queue_push_targets_after_cancel
--  → يحذف اشتراكات بقية الطابور فيُسكِت إشعاراتهم.
--
--  (push_subs_for_entry و queue_push_targets كانتا محروستين داخليًّا بـ
--   is_staff_of فما تسرّبان شيئًا للضيف، لكن نزيل المنح على كل حال — دفاع في العمق.)
--
--  تنظيف الاشتراكات الميّتة يبقى في مسار الاستقبال الموثّق؛ تأخّره لا يضرّ.
-- ============================================================================
revoke execute on function public.delete_push_subscription(text) from anon;
revoke execute on function public.push_subs_for_entry(uuid) from anon;
revoke execute on function public.queue_push_targets(uuid, text) from anon;

-- تبقى متاحة للضيف (محروسة داخليًّا بمطابقة الصف + رقم الجوّال):
--   save_push_subscription · waitlist_ticket_status · queue_push_targets_after_cancel
