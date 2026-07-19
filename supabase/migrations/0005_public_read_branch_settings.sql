-- ============================================================
--  قراءة عامة لإعدادات الفروع النشطة
--  يحتاجها نموذج الحجز العام كي يحترم:
--  accepts_reservations / max_party_size / default_duration_min /
--  booking_window_days. القيم غير حسّاسة ومطلوبة لتجربة الحجز.
-- ============================================================
create policy "public read settings of active branches" on branch_settings
    for select using (
        exists (
            select 1 from branches b
            where b.id = branch_settings.branch_id
              and b.is_active = true
        )
    );
