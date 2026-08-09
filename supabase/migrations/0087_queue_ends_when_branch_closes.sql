-- الطابور ينتهي بإغلاق المطعم — لا بعد ثماني ساعاتٍ من الانضمام.
--
-- المشهد الذي كشفه: فرعٌ ساعاته ١٠:٥٠م–٤:٥١ص، وعميلان انضمّا ١٠:٤٩م
-- و١٠:٥٧م. الساعة ٥:٥٧ص — المطعم مغلقٌ منذ ساعة، والتذكرة تقول «رقم دورك ٢،
-- قدامك شخص واحد بس، بننبّهك على جوّالك قبل دورك». ولا أحد سينبّه ولا أحد
-- سيُجلس. وكان الشرط الوحيد `joined_at < now() - 8 hours`، وهو رقمٌ لا علاقة
-- له بالمطعم: من ينضمّ ١٠:٥٠م لمطعمٍ يغلق ١١م يبقى «منتظرًا» حتى ٦:٥٠ص.
--
-- والقياس الصحيح ساعاتُ المطعم نفسها — وهي معرَّفةٌ عنده أصلًا، وتستعملها
-- ‏`join_waitlist_guest` لتمنع الانضمام وقت الإغلاق. فالباب الذي يُمنع الدخول
-- منه يجب أن يُنهي من في الداخل أيضًا.
--
-- ولا يُقاس على `manually_closed` عمدًا: هو رافعةٌ لحظية بيد المضيف قد
-- يستعملها ليوقف الانضمام الجديد وطابوره ما زال قائمًا — وإسقاط عشرة
-- منتظرين لأنه ضغط زرًّا خرابٌ لا تنظيف. أمّا الساعات فقرارٌ معلن.
--
-- ومهلة ٤٥ دقيقة بعد الانضمام: من دخل قبيل الإغلاق بدقائق قد يكون واقفًا
-- ينتظر إجلاسه، فلا يُسحب دوره من تحته للحظة عبورٍ في الساعة.

create or replace function public.expire_stale_waitlist()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare n int;
begin
  update public.waitlist_entries w
     set status = 'expired'
   where w.status in ('waiting', 'notified')
     and (
       -- شبكة أمان: صفٌّ عمره ثماني ساعات ميّتٌ يقينًا، ولو كان الفرع
       -- بلا ساعاتٍ معرَّفة (فلا يشمله الشرط الثاني أصلًا).
       w.joined_at < now() - interval '8 hours'
       or (
         w.joined_at < now() - interval '45 minutes'
         and exists (
           select 1
             from public.branch_settings s
            where s.branch_id = w.branch_id
              and s.opening_hours is not null
              and not public.branch_open_by_hours(s.opening_hours)
         )
       )
     );
  get diagnostics n = row_count;
  return n;
end $function$;

-- وكل ربع ساعة لا كل ساعة: نافذة الكذب كانت تصل ستّين دقيقة بعد الإغلاق —
-- والتحديث نفسه رخيص (فهرسٌ على الحالة، وصفوفٌ بالعشرات لا بالآلاف).
select cron.unschedule('expire-stale')
 where exists (select 1 from cron.job where jobname = 'expire-stale');

select cron.schedule('expire-stale', '5,20,35,50 * * * *', 'SELECT public.expire_stale_waitlist()');
