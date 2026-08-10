-- ============================================================================
--  قمع التنبيه — الرقم الذي يقرّر إن كان وعدُنا يُوفى.
--
--  وعدُ المنتج جملةٌ واحدة: «روح تمشّى وإحنا ننبّهك». وكل ما بنيناه — الطابور
--  والترتيب واللوحة — يسقط إن لم تصل تلك الرسالة إلى جيب العميل. فهذا
--  الاستعلام يقيس الوعد نفسه لا ما حوله، ويُقرأ من أعلى إلى أسفل:
--
--    انضمّوا  →  مكّنوا التنبيه  →  نبّههم المطعم  →  وصلهم فعلًا
--
--  والانحدار بين أيّ سطرين يقول أين ينكسر:
--    • هبوطٌ عند «مكّنوا»    ⇒ بطاقةُ التثبيت لا تُقنع (أو لا تظهر)
--    • هبوطٌ عند «وصلهم»     ⇒ عطبٌ تقنيّ: مفتاح الخدمة، أو VAPID، أو اشتراكٌ ميّت
--
--  لماذا استعلامٌ لا جدول؟ لأنّ كل ما نحتاجه مخزَّنٌ أصلًا. وجدول أحداثٍ
--  جديد يعني صفوفًا تُكتب في المسار الحرج وسياسةً تُحرَس وبصمةً تكبر — ثمنٌ
--  لا نُدفعه لرقمٍ نستطيع اشتقاقه.
--
--  التشغيل: الصقه في Supabase SQL أو عبر MCP. المدّة الافتراضية ٣٠ يومًا.
-- ============================================================================

-- استبعاد بيانات التجربة: أرقام البذرة المتسلسلة وأسماء البروفات. ولولاه
-- لقرأنا ١.٩٪ ونحن نظنّه سلوك عملاء — وقد كِدتُ أفعلها.
with real_customers as (
  select c.id
  from public.customers c
  where c.phone !~ '^05(52000|5770)'
    and c.full_name !~* '(بروفة|test|canary)'
),
joins as (
  select w.id as entry_id, w.customer_id, w.joined_at, w.notified_at
  from public.waitlist_entries w
  join real_customers rc on rc.id = w.customer_id
  where w.joined_at > now() - interval '30 days'
)
select
  'انضمّوا'                     as المرحلة,
  count(*)                      as العدد,
  '100%'                        as النسبة
from joins
union all
select
  'مكّنوا التنبيه',
  count(*) filter (where exists (
    select 1 from public.push_subscriptions p where p.customer_id = j.customer_id)),
  coalesce(round(100.0 * count(*) filter (where exists (
    select 1 from public.push_subscriptions p where p.customer_id = j.customer_id))
    / nullif(count(*), 0))::text || '%', '—')
from joins j
union all
select
  'نبّههم المطعم',
  count(*) filter (where j.notified_at is not null),
  coalesce(round(100.0 * count(*) filter (where j.notified_at is not null)
    / nullif(count(*), 0))::text || '%', '—')
from joins j
union all
-- ووصلهم فعلًا: صفٌّ في `notifications` بـ delivered — لا «أرسلنا» بل «وصل».
select
  'وصلهم فعلًا',
  count(*) filter (where exists (
    select 1 from public.notifications n
    where n.customer_id = j.customer_id and n.delivered
      and n.sent_at between j.joined_at and coalesce(j.notified_at, now()) + interval '1 hour')),
  coalesce(round(100.0 * count(*) filter (where exists (
    select 1 from public.notifications n
    where n.customer_id = j.customer_id and n.delivered
      and n.sent_at between j.joined_at and coalesce(j.notified_at, now()) + interval '1 hour'))
    / nullif(count(*), 0))::text || '%', '—')
from joins j;
