-- عين الصحة العميقة — health_snapshot() للضيف، بلا أي رقم تجاري.
--
-- الفجوة التي يسدّها: الوظائف الليلية (تجميع، إقفال، تنظيف…) كانت بلا
-- رقيب مستقل — فحص الوكيل اليومي يراها، لكنه يتوقف بتوقف اشتراكه.
-- الآن /api/health يسأل هذه الدالة، فيكشف راصدُ المالك الخارجي موتَ
-- الكرونات خلال ٤٨ ساعة كحد أقصى — منظومة تراقب نفسها بلا أي وكيل.
--
-- cron_fresh تتساهل يومًا كاملًا عمدًا (يومان بلا تجميع = إنذار):
-- صفر إنذارات كاذبة أهم من سرعة إنذار حقيقي نادر.
create or replace function public.health_snapshot()
returns jsonb
language sql stable security definer set search_path to ''
as $function$
  select jsonb_build_object(
    'cron_fresh',
      coalesce((select max(stat_date) from public.daily_stats)
               >= (now() at time zone 'Asia/Riyadh')::date - 2, false),
    'queue_alive',
      exists (select 1 from public.waitlist_entries
              where joined_at > now() - interval '7 days')
  );
$function$;

revoke execute on function public.health_snapshot() from public;
grant execute on function public.health_snapshot() to anon, authenticated;
