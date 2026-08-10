-- جدول `notifications` فارغٌ منذ أوّل يوم — صفر صفوف، ونحن نرسل.
--
-- اكتشفتُه وأنا أقيس «كم عميلًا وصله تنبيه فعلًا» فخرج الجواب صفرًا، وأنا
-- أعلم يقينًا أنّ تنبيهًا وصل جوّالك ليلة أمس. فالخلل في القياس لا في
-- الإرسال: `src/lib/push.ts` يرسل ويعدّ في الذاكرة ويرجع رقمًا، ولا يكتب
-- شيئًا. والجدول — بأعمدته `delivered` و`error` و`channel` — مصنوعٌ لهذا
-- بالضبط، وظلّ يُنسَخ احتياطيًّا ويُحرَس بسياسة ولا يحمل صفًّا واحدًا.
--
-- ومعنى ذلك أنّ الفشل غير مرئيّ: `sendOne` تبتلع الخطأ وترجع false. فلو
-- بدأت آبل ترفض، أو فسد VAPID لشريحة أجهزة، أو ماتت الاشتراكات صامتةً —
-- لا أحد يعلم. وهو بعينه العمى الذي أبقى مفتاح الخدمة معطوبًا أحد عشر يومًا.
--
-- قرارات:
--   • **دفعةٌ واحدة لا صفٌّ صفّ**: إجلاس عميل في فرعٍ ممتلئ قد يرسل مئة
--     إشعار؛ مئةُ نداءٍ للقاعدة خلفها ثمنٌ بلا مقابل. النداء هنا واحدٌ
--     يحمل الدفعة كلّها.
--   • **لا رمز اشتراكٍ في السجلّ**: نخزّن مضيف العنوان وحده
--     (`web.push.apple.com` أو `fcm.googleapis.com`) — وهو التشخيص المفيد:
--     أيّ منصّةٍ ترفض. أمّا الرمز فبصمةُ جهازٍ ثابتة، ولا يُحفظ مرّتين.
--   • **الفرع من دور العميل**: `notifications.branch_id` إلزاميّ، وجدول
--     الاشتراكات لا يحمل فرعًا — فيُؤخذ من أحدث دورٍ للعميل، والحيّ أوّلًا.
--   • **مفتاح الخدمة وحده**: الإشعارات كلّها تُرسَل من خادمنا (0093)، فلا
--     حاجة لأن يملك المتصفّح هذه الدالّة بحال.
create or replace function public.log_push_sends(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_count integer;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return 0;
  end if;

  with rows_in as (
    select r->>'endpoint'  as endpoint,
           r->>'template'  as template,
           (r->>'delivered')::boolean as delivered,
           nullif(r->>'error', '') as err
    from jsonb_array_elements(p_rows) r
  )
  insert into public.notifications
    (branch_id, customer_id, channel, template, payload, sent_at, delivered, error)
  select w.branch_id,
         s.customer_id,
         'push'::public.notification_channel,
         coalesce(ri.template, 'queue'),
         jsonb_build_object('host', split_part(split_part(ri.endpoint, '//', 2), '/', 1)),
         now(),
         ri.delivered,
         left(ri.err, 300)
  from rows_in ri
  join public.push_subscriptions s on s.endpoint = ri.endpoint
  join lateral (
    select w2.branch_id
    from public.waitlist_entries w2
    where w2.customer_id = s.customer_id
    order by (w2.status in ('waiting', 'notified')) desc, w2.joined_at desc
    limit 1
  ) w on true;

  get diagnostics v_count = row_count;
  return v_count;
end
$fn$;

revoke all on function public.log_push_sends(jsonb) from public, anon, authenticated;
grant execute on function public.log_push_sends(jsonb) to service_role;
