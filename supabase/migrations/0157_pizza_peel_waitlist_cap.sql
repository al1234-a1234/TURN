-- ============================================================================
--  سقف طابور Pizza peel — المالك يضغط، لا يحدّد رقمًا بنفسه.
--
--  ⛔ لا يغيّر هذا الترحيل بنفسه أيّ سقف. يُعرِّف دالّةً نائمة يستدعيها زرٌّ
--  في تلغرام («طبّق» / «لا الآن») بعد أن يرسل مسار الويبهوك النصّ — فتطبيق
--  هذا الملفّ على الإنتاج آمنٌ ولا يمسّ شيئًا حتى يُضغَط الزرّ فعلًا.
--
--  ── لماذا 20، لا رقمًا اخترعته من فراغ ──
--  بحثتُ عن إشارةٍ موضوعية قبل الاقتراح: جدول `tables` لفرع Pizza peel
--  النشِط فيه **طاولةٌ واحدة فقط (٤ مقاعد)** — بيانات إعدادٍ أوّليّ لم
--  تُستكمل بعد، لا عدد طاولاتٍ حقيقيّ يُستدلّ به. ونسبة سقف Eficto (50) إلى
--  طاولاته (7) ليست معياريّة أصلًا (٧ لكل ٥٠ سقفًا) فلا تصلح مقياسًا يُنقل.
--  الإشارة الوحيدة الصلبة: **٢٠ كانت القيمة الفعليّة لهذا الفرع نفسه قبل
--  ساعاتٍ قليلة** (موثّقة في ops/CHARTER.md وقت إقراره ٢١:٥٠)، قبل أن تنزل
--  إلى 3 على الأرجح أثناء اختبار مشكلة «الطابور ممتلئ» الليلة نفسها — لا
--  قرارًا تشغيليًّا متعمَّدًا. فاقتراحي: **العودة إلى 20** — رقمٌ اختِير
--  مرّةً فعلًا لا رقمٌ جديد، أقلّ من سقف Eficto (50) بوضوح، ويمنع أن يرى
--  الزائر الرابع للستاند «ممتلئ» من اللحظة الأولى.
-- ============================================================================

create or replace function public.telegram_apply_pizza_peel_waitlist_cap(p_chat_id text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_owner text;
  v_branch_id uuid;
  v_old int;
  v_new constant int := 20;
begin
  select btrim(value) into v_owner from alert_config where key = 'telegram_chat_id';
  if v_owner is null or v_owner = '' or btrim(coalesce(p_chat_id, '')) <> v_owner then
    return null;
  end if;

  select b.id into v_branch_id
    from public.branches b
    join public.restaurants r on r.id = b.restaurant_id
   where r.slug = 'pizza-peel' and b.is_active
   limit 1;

  if v_branch_id is null then
    return '⚠️ ما لقيت فرع Pizza peel النشِط — لم يتغيّر شيء.';
  end if;

  select max_waitlist_size into v_old from public.branch_settings where branch_id = v_branch_id;

  update public.branch_settings
     set max_waitlist_size = v_new, updated_at = now()
   where branch_id = v_branch_id;

  return '✅ سقف طابور Pizza peel: ' || coalesce(v_old::text, 'بلا سقف') || ' ← ' || v_new;
end;
$function$;

revoke all on function public.telegram_apply_pizza_peel_waitlist_cap(text) from public;
revoke all on function public.telegram_apply_pizza_peel_waitlist_cap(text) from anon, authenticated;
