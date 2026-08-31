-- ═══════════════════════════════════════════════════════════════
-- ٠١٤٣ — مهلة إغلاق الساعات + سقفٌ افتراضيّ (توثيقُ واقعٍ قائم)
-- ═══════════════════════════════════════════════════════════════
--
-- ⚠ إعادةُ بناءٍ من التعريف الحيّ على الإنتاج (٣١ أغسطس ٢٠٢٦)، لا النصّ
--   الأصليّ. مطبَّقٌ فعلًا (version 20260829180419) وملفّه مفقود.
--
-- ── ما فعله ──
-- ١) أضاف إلى `expire_stale_waitlist` البندَ (ب): الإغلاق **بحسب ساعات
--    الدوام** صار بمهلة ٩٠ دقيقةً كالإقفال اليدويّ. ولا عمود «وقت إغلاق»
--    في القاعدة والساعة تمرّ بلا حدث — فبدل اختراع عمود، تُسأل الدالّة
--    نفسها عن لحظتين: الآن، وقبل ٩٠ دقيقة. مقفلٌ في الاثنتين ⇒ مضت المهلة.
--    وهذا يعالج النطاق الليليّ العابر لمنتصف الليل مجّانًا.
-- ٢) `branch_open_hours_on(hours, dow)` — طول نافذة الدوام بالساعات ليومٍ
--    بعينه، أساسًا لفحص «فرعٌ مفتوحٌ ٢٤ ساعة» في ٠١٤٥.
-- ٣) سقفٌ افتراضيّ للطابور = ٥٠ على `branch_settings.max_waitlist_size`.
--
-- ── لماذا يهمّ ──
-- `branch_open_hours_on` كانت غائبةً عن المستودع كلّيًّا. والتعريف الكامل
-- لـ`expire_stale_waitlist` أدناه يحمل **البندين معًا** (ج من ٠١٤٠ و ب من
-- ٠١٤٣) لأنّه الحالة الحيّة الفعليّة — والحالةُ الوسيطة بينهما غير
-- قابلةٍ للاسترجاع، فلم أخترعها.
--   بصمة الجسم الحيّ  : 4ed780a2f860983f47a1067fba3233e5
--   بصمة نسخة 0123    : 9ddc20595ae7fd4564f2ee9a9eb879d8  ← بلا البندين

begin;

create or replace function public.branch_open_hours_on(p_hours jsonb, p_dow integer)
 returns numeric
 language plpgsql
 immutable
 set search_path to ''
as $function$
declare
  v_o time; v_c time;
begin
  if p_hours is null then return 24; end if;

  begin
    v_o := coalesce(nullif(btrim(p_hours->'days'->(p_dow::text)->>'open'), ''),
                    nullif(btrim(p_hours->>'open'), ''))::time;
    v_c := coalesce(nullif(btrim(p_hours->'days'->(p_dow::text)->>'close'), ''),
                    nullif(btrim(p_hours->>'close'), ''))::time;
  exception when others then
    return 24;
  end;

  if v_o is null or v_c is null then return 24; end if;
  if v_o = v_c then return 24; end if;

  if v_o < v_c then
    return extract(epoch from (v_c - v_o)) / 3600.0;
  end if;

  return (extract(epoch from (time '24:00' - v_o)) + extract(epoch from v_c)) / 3600.0;
end;
$function$;

-- التعريف الحيّ الكامل — البند (ب) من ٠١٤٣ و(ج) من ٠١٤٠ معًا
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
       -- (أ) شبكة الأمان الأخيرة
       w.joined_at < now() - interval '8 hours'

       -- (ب) إغلاق الساعات — صار بمهلة ٩٠ دقيقة كالإقفال اليدويّ.
       --     لا عمود «وقت الإغلاق» عندنا، والساعة تمرّ بلا حدث. فبدل
       --     اختراع عمود: نسأل الدالّة نفسها عن لحظتين — الآن، وقبل ٩٠
       --     دقيقة. مقفلٌ في الاثنتين ⇒ مضت المهلة. وهذا يعالج النطاق
       --     الليليّ العابر لمنتصف الليل مجّانًا لأن الدالّة تعالجه أصلًا.
       or exists (
         select 1
           from public.branch_settings s
          where s.branch_id = w.branch_id
            and s.opening_hours is not null
            and not public.branch_open_by_hours(s.opening_hours)
            and not public.branch_open_by_hours(s.opening_hours, now() - interval '90 minutes')
       )

       -- (ج) الإقفال اليدويّ — كما هو منذ 0140
       or exists (
         select 1
           from public.branch_settings s
          where s.branch_id = w.branch_id
            and s.manually_closed
            and s.updated_at < now() - interval '90 minutes'
       )
     );
  get diagnostics n = row_count;
  return n;
end
$function$;

alter table public.branch_settings alter column max_waitlist_size set default 50;

commit;
