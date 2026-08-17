-- ════════════════════════════════════════════════════════════════════════════
--  التحقّق من الصحّة تحت التزامن — يُنفَّذ بعد كل درجة
--
--  نظامٌ سريعٌ يعطي نتائج خاطئة أسوأ من نظامٍ بطيءٍ صحيح. السرعة تظهر في k6،
--  والصحّة لا تظهر إلا هنا.
--
--  ⛔ القاعدة: **كل صفٍّ يرجع من هذا الملفّ = عطبٌ في التزامن.**
--     إن رجع صفٌّ واحد، توقّف عن التصعيد وسجّل الدرجة السابقة كسقفٍ آمن.
-- ════════════════════════════════════════════════════════════════════════════

-- (١) رقم ترتيبٍ مكرّر بين صفّين حيّين في الفرع الواحد
--     يعني أنّ القفل الاستشاريّ لم يمنع تسابق انضمامين
select 'ترتيبٌ مكرّر' as العطب, b.name as الفرع,
       w."position"::text as التفصيل, count(*) as المرّات
from public.waitlist_entries w
join public.branches b on b.id = w.branch_id
where w.status in ('waiting','notified')
group by b.name, w."position"
having count(*) > 1

union all

-- (٢) شخصٌ أُجلِس وهو ملغى أو منتهٍ — انتقال حالةٍ غير مشروع نفذ من حارسه
select 'إجلاسٌ فوق حالةٍ نهائيّة', b.name,
       w.id::text, 1
from public.waitlist_entries w
join public.branches b on b.id = w.branch_id
where w.status = 'seated' and w.seated_at is null

union all

-- (٣) فرعٌ تجاوز سقف الـ٣٠٠ — حارس trg_branch_queue_cap تُخُطّي
select 'تجاوز سقف الفرع', b.name,
       count(*)::text, 1
from public.waitlist_entries w
join public.branches b on b.id = w.branch_id
where w.status in ('waiting','notified')
group by b.name
having count(*) > 300

union all

-- (٤) صفّان حيّان لنفس العميل في نفس الفرع — الفهرس الفريد خُرِق
select 'صفّان حيّان لعميلٍ واحد', b.name,
       w.customer_id::text, count(*)
from public.waitlist_entries w
join public.branches b on b.id = w.branch_id
where w.status in ('waiting','notified')
group by b.name, w.customer_id
having count(*) > 1

union all

-- (٥) حجزان متداخلان على الطاولة نفسها — تسابقٌ على آخر طاولة
select 'طاولةٌ محجوزةٌ مرّتين', b.name,
       r1.table_id::text, 1
from public.reservations r1
join public.reservations r2
  on r2.table_id = r1.table_id and r2.id <> r1.id
 and r2.status in ('pending','confirmed') and r1.status in ('pending','confirmed')
 and tstzrange(r2.reserved_at, r2.reserved_at + make_interval(mins => coalesce(r2.duration_min,90)))
   && tstzrange(r1.reserved_at, r1.reserved_at + make_interval(mins => coalesce(r1.duration_min,90)))
join public.branches b on b.id = r1.branch_id
where r1.table_id is not null

union all

-- (٦) ترتيبٌ يخالف ترتيب الوصول — من جاء لاحقًا وترتيبه أقلّ
--     هذا هو عطب منتصف الليل بعينه (الترحيل 0108) — نتأكّد ألّا يعود
select 'ترتيبٌ يخالف الوصول', b.name,
       'صفّ ' || late.id::text, 1
from public.waitlist_entries late
join public.waitlist_entries early
  on early.branch_id = late.branch_id
 and early.status in ('waiting','notified')
 and late.status  in ('waiting','notified')
 and early.joined_at < late.joined_at
 and early."position" > late."position"
join public.branches b on b.id = late.branch_id

order by 1;

-- ── ضابطٌ موجب: لو رجع هذا فارغًا فالحمل لم يصل القاعدة أصلًا ──
select 'ضابط: صفوفٌ أُنشئت أثناء الحمل' as البند,
       count(*)::text as العدد
from public.waitlist_entries
where joined_at > now() - interval '1 hour';
