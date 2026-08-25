-- ٠١١٥ — check_platform_health(): لقطة JSON لصحة المنصّة، بلا أي ربط إرسال
--
-- الغرض: دالّةٌ يستدعيها المشغّل (لوحة تحكّم، مهمّة مجدولة خارجية، أو
-- استعلامٌ يدويّ) لتشخيص عطبين صامتين تحديدًا:
--
-- (أ) مهمّة pg_cron توقّفت أو فشلت بلا أن يلحظ أحد — فلا تقرير يوميّ، ولا
--     تنظيف طوابين، ولا استرجاع عملاء نائمين. لكل مهمّة سبع فجوةٌ قصوى
--     مختلفة بحسب دورتها (٣٠ دقيقة لـexpire-stale كل ربع ساعة، ٨ أيام
--     لـweekly_digest الأسبوعية، ٢٦ ساعة للباقي اليوميّ) — لا فحصٌ واحدٌ
--     عامّ كان سيُنذر كذبًا كل يوم عن المهمّة السريعة أو يفوّت تأخّر
--     الأسبوعية أيامًا قبل أن يُكتشف.
--
-- (ب) لا أحد ينضمّ لأيّ طابور خلال ساعةٍ كاملة وقت الذروة — إشارةٌ على
--     عطبٍ في مسار الانضمام نفسه (bug، أو BotID يرفض عملاء حقيقيين خطأً،
--     أو تعطّل الواجهة) لا نقص طلبٍ طبيعي. «وقت الذروة» هنا نافذةٌ عامّة
--     لا لكل فرعٍ بمفرده: عمود opening_hours في branch_settings موجودٌ
--     لكنه غير مكتمَلٍ لكل الفروع (بعضها {} فارغ) فلا يصلح مرجعًا موثوقًا
--     الآن، فاعتُمدت نافذة العشاء العامّة (١٩-٢٣ بتوقيت الرياض) التي تقع
--     داخل ساعات كل المطاعم العشرة عمليًّا (نمط "يفتح ٦ مساءً" الموثَّق في
--     تعليق tv/[id]/page.tsx).
--
-- بلا ربطٍ بأي قناة إرسال عمدًا — طلبٌ صريح: المشغّل يربطها بنفسه.
-- EXECUTE مقصورٌ على authenticated (staff/admin) وservice_role — ليست
-- بيانات ضيفٍ ولا داعي لكشفها لـanon.

create or replace function public.check_platform_health()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_problem_jobs jsonb;
  v_joins_last_hour integer;
  v_riyadh_hour integer;
  v_is_peak boolean;
begin
  v_riyadh_hour := extract(hour from (now() at time zone 'Asia/Riyadh'))::int;
  v_is_peak := v_riyadh_hour between 19 and 23;

  select coalesce(jsonb_agg(jsonb_build_object(
           'jobname', j.jobname,
           'last_status', lr.status,
           'last_run_at', lr.start_time,
           'minutes_since_last_run',
             case when lr.start_time is null then null
                  else round(extract(epoch from (now() - lr.start_time)) / 60)::int end
         ) order by j.jobname), '[]'::jsonb)
    into v_problem_jobs
  from cron.job j
  left join lateral (
    select d.status, d.start_time
    from cron.job_run_details d
    where d.jobid = j.jobid
    order by d.start_time desc
    limit 1
  ) lr on true
  where j.active
    and (
      lr.start_time is null
      or lr.status is distinct from 'succeeded'
      or lr.start_time < now() - (case j.jobname
           when 'expire-stale'   then interval '30 minutes'
           when 'weekly_digest'  then interval '8 days'
           else interval '26 hours'
         end)
    );

  select count(*) into v_joins_last_hour
  from public.waitlist_entries
  where joined_at > now() - interval '1 hour';

  return jsonb_build_object(
    'generated_at', now(),
    'cron', jsonb_build_object(
      'jobs_total', (select count(*) from cron.job where active),
      'problem_jobs', v_problem_jobs
    ),
    'waitlist_anomaly', jsonb_build_object(
      'riyadh_hour', v_riyadh_hour,
      'is_peak_window', v_is_peak,
      'joins_last_hour', v_joins_last_hour,
      'anomaly', v_is_peak and v_joins_last_hour = 0
    )
  );
end;
$$;

revoke execute on function public.check_platform_health() from public;
grant execute on function public.check_platform_health() to authenticated;
