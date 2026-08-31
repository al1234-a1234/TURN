-- ═══════════════════════════════════════════════════════════════
-- ٠١٤٠ — الإقفال اليدويّ بمهلة ٩٠ دقيقة (توثيقُ واقعٍ قائم)
-- ═══════════════════════════════════════════════════════════════
--
-- ⚠ إعادةُ بناءٍ من التعريف الحيّ على الإنتاج (٣١ أغسطس ٢٠٢٦)، لا النصّ
--   الأصليّ. الترحيل مطبَّقٌ فعلًا (version 20260829023741) وملفّه مفقود.
--
-- ── ما فعله هذا الترحيل ──
-- أضاف إلى `expire_stale_waitlist` البندَ (ج): الفرع المُقفَل يدويًّا
-- تُشطب تذاكره بعد **٩٠ دقيقة** من الإقفال لا فورًا — لأنّ الموظّف قد
-- يقفل الطابور وهو ما زال يُجلّس من في الداخل، فالشطب الفوريّ يمسح
-- عملاء واقفين فعلًا.
-- وأضاف `alert_closed_branch_with_waiters` وكرونها: تنبيهٌ للمالك أنّ
-- فرعًا أُقفل وفيه منتظرون، مرّةً واحدةً لكلّ إقفال (لا تكرار) عبر
-- `alert_state`.
--
-- ── لماذا يهمّ ──
-- `alert_closed_branch_with_waiters` كانت غائبةً عن المستودع كلّيًّا.
-- أمّا البند (ج) فيعيش داخل `expire_stale_waitlist`، ونسخةُ المستودع
-- (`0123`) لا تحوي منه شيئًا — فأيّ `create or replace` من ذلك الملفّ
-- كان **يمحو المهلة صامتًا** فتعود التذاكر تُشطب لحظة الإقفال.
--   بصمة الجسم الحيّ  : 4ed780a2f860983f47a1067fba3233e5
--   بصمة نسخة 0123    : 9ddc20595ae7fd4564f2ee9a9eb879d8
-- التعريفُ الكامل الموحَّد (البندان ج + ب معًا) في `0143`، لأنّ ٠١٤٣
-- عدّل الدالّة نفسها بعد هذا الترحيل ولا يمكن استرجاع الحالة الوسيطة
-- من الإنتاج — لا تُخترع هنا حالةٌ لم أرَها.

begin;

create or replace function public.alert_closed_branch_with_waiters()
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  r record;
  v_tok text; v_chat text; v_key text; v_failing boolean;
begin
  select value into v_tok  from public.alert_config where key='telegram_bot_token';
  select value into v_chat from public.alert_config where key='telegram_chat_id';

  for r in
    select b.id as branch_id, rst.name as rest, b.name as br,
           count(w.id) as واقفون,
           coalesce(s.manually_closed,false) as يدويّ,
           round(extract(epoch from (now() - min(w.joined_at)))/60) as أقدم_دقيقة
      from public.branches b
      join public.restaurants rst on rst.id = b.restaurant_id
      join public.branch_settings s on s.branch_id = b.id
      join public.waitlist_entries w
        on w.branch_id = b.id and w.status in ('waiting','notified')
     where b.is_active and not rst.is_canary
       and ( coalesce(s.manually_closed,false)
             or (s.opening_hours is not null
                 and not public.branch_open_by_hours(s.opening_hours)) )
     group by b.id, rst.name, b.name, s.manually_closed
  loop
    v_key := 'closed_waiters:' || r.branch_id::text;
    select is_failing into v_failing from public.alert_state where check_key = v_key;

    if coalesce(v_failing,false) then
      continue;   -- نُبّه سابقًا — لا تكرار
    end if;

    insert into public.alert_state(check_key, is_failing, last_changed_at, last_message)
    values (v_key, true, now(),
            format('فرع مقفل وفيه %s منتظرًا', r.واقفون))
    on conflict (check_key) do update
       set is_failing = true, last_changed_at = now(),
           last_message = excluded.last_message;

    if v_tok is not null and v_chat is not null then
      perform net.http_post(
        url := 'https://api.telegram.org/bot' || v_tok || '/sendMessage',
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := jsonb_build_object('chat_id', v_chat, 'text',
          '⏳ دور — فرع مقفل وفيه منتظرون' || E'\n\n' ||
          r.rest || ' · ' || r.br || E'\n' ||
          'المقفَل: ' || case when r.يدويّ then 'يدويًّا' else 'حسب ساعات الدوام' end || E'\n' ||
          'في الطابور: ' || r.واقفون || ' — أقدمهم منذ ' || r.أقدم_دقيقة || ' دقيقة' || E'\n\n' ||
          'أمامك ٩٠ دقيقة من لحظة الإغلاق لإجلاسهم، ثم تُشطب تذاكرهم تلقائيًّا.' || E'\n' ||
          'لإفراغ الطابور الآن: زرّ «إفراغ الطابور» في لوحة الاستقبال.' || E'\n' ||
          'لإعادة الفتح: أرسل «افتح ' || r.rest || '».')
      );
    end if;
  end loop;

  -- إعادة الضبط لمن لم يعد مقفلًا أو لم يبقَ فيه أحد
  update public.alert_state a
     set is_failing = false, last_changed_at = now()
   where a.check_key like 'closed_waiters:%' and a.is_failing
     and not exists (
       select 1 from public.branches b
       join public.branch_settings s on s.branch_id = b.id
       join public.waitlist_entries w on w.branch_id = b.id and w.status in ('waiting','notified')
      where 'closed_waiters:' || b.id::text = a.check_key
        and ( coalesce(s.manually_closed,false)
              or (s.opening_hours is not null
                  and not public.branch_open_by_hours(s.opening_hours)) )
     );
end;
$function$;

-- ⚠ كما في ٠١٤١: هذه الحالة **قبل** ٠١٧٠ الذي ينقل الإرسال إلى
--   `notify_telegram`. الترتيب محفوظ.

revoke execute on function public.alert_closed_branch_with_waiters() from anon, authenticated;

select cron.schedule('closed-branch-waiters', '*/5 * * * *',
                     $$select public.alert_closed_branch_with_waiters()$$)
 where not exists (select 1 from cron.job where jobname = 'closed-branch-waiters');

commit;
