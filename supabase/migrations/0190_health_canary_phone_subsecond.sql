-- ═══ هاتف الطُّعم: دقّةٌ دون الثانية — إغلاق الإنذار الكاذب اليوميّ ═══
--
-- العَرَض: ٢٠٢٦-٠٩-٠١ ٠٤:٠٠ خرج 🔴 «وظيفة الحجز نفسها معطّلة»، وتعافى
-- ٠٤:٠٥. والتفصيل في الإنذار كان رسالتنا نحن لا خطأ خادم:
--     {"ok": false, "error": "محاولات كثيرة — انتظر دقائق ثم حاول"}
-- ولقطةُ ٠٤:١٦ خزّنت العطل نفسه في daily_snapshot.payload، أي أنّ أوّل
-- خطّ أساسٍ يقارن به تقريرُ الغد مغلوط.
--
-- ══ السبب ══
-- هاتف الطُّعم دقّتُه ثانيةٌ واحدة:
--     '05' || lpad((extract(epoch from clock_timestamp())::bigint % 100000000)::text, 8, '0')
-- والحدُّ في join_waitlist_guest:
--     check_rate('join:p:' || norm_phone_input(...), 3, interval '10 minutes')
-- فأيّ فحصَي صحّةٍ في الثانية نفسها يتقاسمان الهاتف نفسه ويتراكمان على
-- عدّادٍ واحد. وفي ٠٤:٠٠:٠٠ انطلقت وظيفتان تستدعيان check_platform_health
-- بفارق ٣ ملي‌ثانية: operator-status-digest (0 4,18 * * *) و
-- platform-health-alerts (*/5). وsnapshot_payload تستدعيها مرّتين نصًّا
-- في الاستدعاء الواحد — فتصطدم بنفسها بلا أيّ تزامن.
--
-- والدليل من rate_limits: تشغيلٌ منفردٌ يعطي count=1 دائمًا (٠٣:٥٥،
-- ٠٤:٠٥، ٠٤:١٠، ٠٤:١٥)، ونبضةُ ٠٤:٠٠ أعطت مفتاحين كلٌّ منهما ٣ — السقف.
--
-- ══ الإصلاح ══
-- ثمان خاناتٍ عشوائيّة كاملة بدل الاشتقاق من الثانية. لا تزامنَ يهمّ
-- بعدها: لا يتقاسم استدعاءان هاتفًا إلّا مصادفةً باحتمال ١٠⁻⁸.
--
-- قِيس قبل التطبيق على الإنتاج (قراءةً فقط، ٢٠٠٠٠ توليدة):
--   ١٩٩٩٨ قيمةً مميّزة، أسوأ تكرارٍ ٢ (دون السقف ٣)
--   الطول ١٠ في كلّ حالة، وnorm_phone_input تطابق ‎^5[0-9]{8}$‎ في كلّها
--   صفر تقاطعٍ مع هواتف العملاء الـ١٤٢٤ القائمين
-- والعيّنة وحدها تعادل ~٦٦ سنةً من حجم الطُّعم الفعليّ (~٣٠٠ يوميًّا).
--
-- ══ لماذا استبدالٌ مرتكز لا إعادة كتابة ══
-- الدالّة ٧٧٥٦ حرفًا وفيها إصلاحاتٌ حيّة (٠١٧٣ وغيره). إعادةُ كتابتها من
-- المستودع تُعيد أيّ انحرافٍ لا نعلمه. فالمرساة سطرٌ واحد، وإن لم يُطابق
-- تسقط الهجرة كلّها ولا تمرّ صامتة.
--
-- التراجع: 0191_ROLLBACK_health_canary_phone.sql (مكتوبٌ قبل هذا الملفّ)

do $mig$
declare d text; d2 text;
begin
  select pg_get_functiondef(oid) into d from pg_proc
   where proname='check_platform_health' and pronamespace='public'::regnamespace;
  if d is null then raise exception 'check_platform_health غير موجودة'; end if;

  d2 := replace(d,
    '''05'' || lpad((extract(epoch from clock_timestamp())::bigint % 100000000)::text, 8, ''0'')',
    '''05'' || lpad(floor(random() * 100000000)::bigint::text, 8, ''0'')');
  if d2 = d then raise exception 'مرساة هاتف الطُّعم لم تُطابق — لم يُغيَّر شيء'; end if;
  execute d2;
end $mig$;

-- حارسٌ دائم w55: لا عودةَ لاشتقاق هاتف الطُّعم من الثانية
do $mig2$
declare d text; d2 text; v_new text;
begin
  select pg_get_functiondef(oid) into d from pg_proc
   where proname='run_critical_checks' and pronamespace='public'::regnamespace;

  v_new :=
       E'    (''w55_health_canary_phone_subsecond'',\n'
    || E'       (select position(''lpad(floor(random() * 100000000)'' in pg_get_functiondef(oid)) > 0\n'
    || E'           and position(''(extract(epoch from clock_timestamp())::bigint'' in pg_get_functiondef(oid)) = 0\n'
    || E'          from pg_proc where proname=''check_platform_health''\n'
    || E'           and pronamespace=''public''::regnamespace)),\n';

  d2 := replace(d, E'    (''q20_schema_no_drift'',', v_new || E'    (''q20_schema_no_drift'',');
  if d2 = d then raise exception 'مرساة q20 لم تُطابق'; end if;
  execute d2;
end $mig2$;

-- تحقّقٌ بعديّ: الحارس أُضيف وأخضر، والطُّعم يعمل فعلًا بعد التغيير
do $verify$
declare v_fail text; v_w55 boolean; v_health jsonb; v_booking jsonb;
begin
  select pass into v_w55 from public.run_critical_checks()
   where name='w55_health_canary_phone_subsecond';
  if v_w55 is null then raise exception 'w55 لم يُضف'; end if;
  if not v_w55 then raise exception 'w55 راسب فور إضافته'; end if;

  select coalesce(string_agg(name,'، ') filter (where not pass),'—') into v_fail
    from public.run_critical_checks();
  if v_fail <> '—' then raise exception 'فحوصٌ راسبة: %', v_fail; end if;

  -- الطُّعم نفسه: انضمامٌ ثمّ إلغاءٌ ثمّ حذف، بالمسار الحيّ لا بالمحاكاة
  v_health := public.check_platform_health();
  v_booking := v_health->'booking_writepath';
  if (v_booking->>'ok')::boolean is not true then
    raise exception 'مسار الحجز راسبٌ بعد التغيير: %', v_booking::text;
  end if;
end
$verify$;
