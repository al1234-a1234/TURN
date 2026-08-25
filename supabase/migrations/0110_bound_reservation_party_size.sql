-- ٠١١٠ — سقف صريح على party_size للحجوزات + سقف على max_party_size نفسه
--
-- ٠٠٧١ سدّ الثغرة على الطابور بطبقتين: الدالة تقصّ إلى ماكس الفرع، والقيد
-- (party_size <= 50) حاجزٌ أخير في القاعدة. الحجوزات (reservations) أخذت
-- طبقة الدالة فقط (book_reservation_guest يقصّ بـ least(..., v_maxparty))
-- بلا الحاجز الأخير — فحُصت الآن فعليًّا (party_size سالب/ضخم داخل
-- begin/rollback) والدالة تقصّ بلا خطأٍ خام يصل الضيف، لكن الحاجز الثاني
-- غائب: لو صار max_party_size نفسه رقمًا غير معقول (لا قيد عليه أصلًا —
-- ٠ صفوف مخالفة اليوم، الحدّ الفعلي ٤-٢٠) لمرّ رقمٌ كبير من مسار الحجز
-- وحده دون الطابور.
--
-- الإصلاح بنفس منطق ٠٠٧١ حرفيًّا: قيدٌ على الجدول + قيدٌ على مصدر الحدّ.

ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_party_size_max CHECK (party_size <= 50);

ALTER TABLE public.branch_settings
  ADD CONSTRAINT branch_settings_max_party_size_range CHECK (max_party_size BETWEEN 1 AND 50);
