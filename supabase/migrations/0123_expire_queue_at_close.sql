-- ٠١٢٣ — تصفير الطابور عند إغلاق الفرع، لا بعده بخمسٍ وأربعين دقيقة
--
-- شكوى مباشرة من المشغّل: أخذ دورًا وترك الموقع، وبقي شريط «دورك» معلّقًا
-- له طويلًا — «المفروض بمجرد ما يجي وقت الاغلاق تصفر الدنيا خلاص يروح
-- الادوار». المهلة القديمة (٤٥ دقيقة بعد الإغلاق) تُحذف: الفرع المغلق
-- بجدول دوامه انتهى يومه، والانضمام مقفلٌ وقت الإغلاق أصلًا (دالة
-- الانضمام تفحص branch_open_by_hours) فلا صفوفَ شرعيةً جديدة تتشكّل بعده.
-- الكرون يمرّ كل ربع ساعة، فأقصى تأخّرٍ فعليّ للتصفير ~١٥ دقيقة.
--
-- سقف الثماني ساعات يبقى: هو الحارس الوحيد لفرعٍ لم يضبط ساعات دوامه.

create or replace function public.expire_stale_waitlist()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare n int;
begin
  update public.waitlist_entries w
     set status = 'expired'
   where w.status in ('waiting', 'notified')
     and (
       w.joined_at < now() - interval '8 hours'
       or exists (
         select 1
           from public.branch_settings s
          where s.branch_id = w.branch_id
            and s.opening_hours is not null
            and not public.branch_open_by_hours(s.opening_hours)
       )
     );
  get diagnostics n = row_count;
  return n;
end $$;
