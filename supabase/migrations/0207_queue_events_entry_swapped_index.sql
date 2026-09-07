-- فحص شامل بعد شغل اليوم: staff_branch_queue.last_swap_name (0204) يستعلم
-- queue_events بـentry_id لكل صفٍّ ظاهرٍ في الطابور — وهذا الجدول بلا فهرس
-- على entry_id إطلاقًا، فكل استدعاء (كل ٤-٣٠ث لكل شاشة استقبال مفتوحة)
-- كان Seq Scan كاملًا على الجدول (تأكّدت بـEXPLAIN: Rows Removed by
-- Filter: 704). صغيرٌ الآن، لكن تنظيف الـ٣٠-يوم أُلغي اليوم أيضًا (0203) —
-- الجدول سينمو بلا سقفٍ من الآن، فهذا المسار كان سيتباطأ تدريجيًّا لا
-- فجأة. فهرسٌ جزئيّ (kind='swapped' فقط، هو كل ما يقرأه هذا المسار)
-- يحوّله إلى Index Scan بصرف النظر عن حجم الجدول لاحقًا.

create index if not exists idx_queue_events_entry_swapped
  on public.queue_events (entry_id, at desc)
  where kind = 'swapped';
