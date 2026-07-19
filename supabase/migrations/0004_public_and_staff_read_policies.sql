-- ============================================================
--  سياسات RLS إضافية لتشغيل الواجهات:
--  1) قراءة عامة للمطاعم النشطة (لصفحة الحجز العامة /r/[slug])
--  2) قراءة الطاقم لبيانات العملاء الذين لديهم حجز/انتظار في فروع مطعمه
-- ============================================================

-- العميل غير المسجّل يحتاج قراءة اسم المطعم النشط عبر الرابط العام
create policy "public read active restaurants" on restaurants
    for select using (is_active = true);

-- الطاقم يقرأ بيانات العملاء المرتبطين بحجوزات/انتظار في فروع مطعمه فقط
create policy "staff reads branch customers" on customers
    for select using (
        exists (
            select 1 from reservations r
            where r.customer_id = customers.id
              and is_staff_of(restaurant_of_branch(r.branch_id))
        )
        or exists (
            select 1 from waitlist_entries w
            where w.customer_id = customers.id
              and is_staff_of(restaurant_of_branch(w.branch_id))
        )
    );
