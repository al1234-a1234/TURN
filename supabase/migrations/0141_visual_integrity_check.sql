-- ═══════════════════════════════════════════════════════════════
-- ٠١٤١ — فحص السلامة البصريّة (توثيقُ واقعٍ قائم)
-- ═══════════════════════════════════════════════════════════════
--
-- ⚠ هذا الملفّ **إعادةُ بناءٍ من التعريف الحيّ على الإنتاج** بتاريخ
--   ٣١ أغسطس ٢٠٢٦، لا نصُّه الأصليّ — فالأصل غير موجودٍ في المستودع.
--   الترحيل `0141_visual_integrity_check` **مطبَّقٌ على الإنتاج فعلًا**
--   (`supabase_migrations.schema_migrations` version 20260829024027)
--   لكنّ ملفّه لم يُودَع قطّ.
--
-- ── لماذا يهمّ ──
-- `check_visual_integrity` و`alert_visual_integrity` كانتا موجودتين في
-- الإنتاج وغائبتين عن المستودع كلّيًّا. فأيّ إعادة بناءٍ للقاعدة من
-- الترحيلات (تعافٍ من كارثة، أو بيئةٌ جديدة) كانت ستُنتج نظامًا بلا هذا
-- الفحص إطلاقًا — والعطل الذي يكشفه صامتٌ بطبيعته: الصفحة تُحمَّل بحالة
-- ٢٠٠ لكنّ ملفّ التنسيق لا يصل، فيرى العميل نصًّا خامًّا وروابط زرقاء
-- بينما كلّ فحوص «هل الموقع يعمل؟» خضراء.
--
-- لا تغييرَ سلوكٍ هنا: الدالّتان قائمتان بهذا التعريف نفسه الآن.

begin;

create or replace function public.check_visual_integrity()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_home    public.http_response;
  v_css     public.http_response;
  v_href    text;
  v_len     int;
  v_ok      boolean := true;
  v_reason  text := '';
begin
  begin
    select * into v_home from public.http_get('https://ei8ht.app/');
  exception when others then
    return jsonb_build_object('ok', false, 'stage', 'home_fetch', 'error', sqlerrm);
  end;

  if v_home.status <> 200 then
    return jsonb_build_object('ok', false, 'stage', 'home_status', 'status', v_home.status);
  end if;

  v_href := (regexp_match(v_home.content,
             '<link[^>]+rel="stylesheet"[^>]+href="([^"]+\.css[^"]*)"'))[1];

  if v_href is null then
    return jsonb_build_object('ok', false, 'stage', 'no_stylesheet_link',
      'hint', 'الصفحة لا تشير إلى أي ملف تنسيق إطلاقًا — بناءٌ مكسور');
  end if;

  if left(v_href,1) = '/' then
    v_href := 'https://ei8ht.app' || v_href;
  end if;

  begin
    select * into v_css from public.http_get(v_href);
  exception when others then
    return jsonb_build_object('ok', false, 'stage', 'css_fetch',
      'href', v_href, 'error', sqlerrm);
  end;

  v_len := coalesce(length(v_css.content), 0);

  if v_css.status <> 200 then
    v_ok := false; v_reason := v_reason || format('حالة %s؛ ', v_css.status);
  end if;

  if v_len < 10000 then
    v_ok := false; v_reason := v_reason || format('حجم %s بايت فقط؛ ', v_len);
  end if;

  if position('--brand' in v_css.content) = 0
     and position('rq-btn' in v_css.content) = 0 then
    v_ok := false; v_reason := v_reason || 'لا يحوي رموز تنسيقنا؛ ';
  end if;

  return jsonb_build_object(
    'ok', v_ok,
    'href', v_href,
    'css_status', v_css.status,
    'css_bytes', v_len,
    'reason', nullif(v_reason, ''),
    'checked_at', now()
  );
end;
$function$;

create or replace function public.alert_visual_integrity()
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v jsonb;
  v_tok text; v_chat text;
begin
  v := public.check_visual_integrity();
  if coalesce((v->>'ok')::boolean, false) then
    return;
  end if;

  select value into v_tok  from public.alert_config where key='telegram_bot_token';
  select value into v_chat from public.alert_config where key='telegram_chat_id';
  if v_tok is null or v_chat is null then return; end if;

  perform net.http_post(
    url := 'https://api.telegram.org/bot' || v_tok || '/sendMessage',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object('chat_id', v_chat, 'text',
      '🔴 دور — الصفحة تُحمَّل لكنها مكسورة بصريًّا' || E'\n\n' ||
      'ملف التنسيق الذي تشير إليه الرئيسيّة لا يصل سليمًا.' || E'\n' ||
      'الرابط: ' || coalesce(v->>'href','—') || E'\n' ||
      'الحالة: ' || coalesce(v->>'css_status','—') ||
      ' · الحجم: ' || coalesce(v->>'css_bytes','—') || ' بايت' || E'\n' ||
      'السبب: ' || coalesce(v->>'reason', v->>'stage', '—') || E'\n\n' ||
      'العميل يرى نصًّا خامًّا وروابط زرقاء. البيانات سليمة والشكل مفقود.')
  );
end;
$function$;

-- ⚠ ملاحظةٌ للقارئ: `alert_visual_integrity` هنا بحالتها **قبل** الترحيل
--   `0170_alert_channel_complete` الذي ينقلها إلى `notify_telegram`. هذا
--   الملفّ يوثّق ٠١٤١ كما هو، و٠١٧٠ يعدّله لاحقًا بترتيب الترحيلات.

revoke execute on function public.check_visual_integrity() from anon, authenticated;
revoke execute on function public.alert_visual_integrity()  from anon, authenticated;

select cron.schedule('visual-integrity', '*/15 * * * *',
                     $$select public.alert_visual_integrity()$$)
 where not exists (select 1 from cron.job where jobname = 'visual-integrity');

commit;
