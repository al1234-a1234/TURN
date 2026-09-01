-- ═══ CRITICAL-1: نقل امتداد http خارج المخطّط المكشوف ═══
--
-- الثغرة: public.http_get قابلةٌ للاستدعاء من دور anon عبر PostgREST،
-- فأيّ أحدٍ يملك المفتاح العلنيّ (وهو في حزمة المتصفّح) يجعل قاعدتنا
-- تطلب أيّ عنوانٍ يختاره — SSRF من داخل الشبكة. أُثبت عمليًّا من عدّاء
-- GitHub (التشغيل 33467268398): HTTP 200 ومعه <title>Example Domain</title>.
--
-- ══ لماذا النقل، ولا شيء أضيق منه ══
-- جُرّبت كلّ رافعةٍ أضيق على المحاكاة بمعاملاتٍ تُرجِع نفسها:
--   REVOKE EXECUTE … FROM public, anon  → يجري بلا خطأ وبلا أثر: anon t→t
--   ALTER EXTENSION … DROP FUNCTION     → 42501 must be owner of extension
--   ALTER FUNCTION … OWNER TO postgres  → 42501 must be owner of function
--   DROP EXTENSION                      → ينجح
-- الامتداد يملكه supabase_admin ولسنا أعضاءً فيه (pg_has_role=false،
-- rolsuper=false). فلا سبيلَ إلى تضييق المنح؛ الإزالةُ وحدها متاحة.
--
-- والبديل الآخر — نقل المراقبات إلى pg_net — سقط بقياسٍ لا بتقدير:
-- استطلاعٌ ٥ ثوانٍ داخل معاملةٍ واحدة لم يصله ردّ (request_id=8). عاملُ
-- pg_net الخلفيّ لا يقرأ إلّا الصفوف المودَعة، وcheck_platform_health
-- مبنيّةٌ على استجابةٍ فوريّة كلّ خمس دقائق.
--
-- ══ لماذا هذا آمن ══
-- PostgREST يكشف المخطّطات المُعلنة وحدها (public, graphql_public). ودالّةٌ
-- في extensions ليست على مسار ‎/rest/v1/rpc/‎ — والإثباتُ ليس ادّعاءً هنا:
-- مسبار GitHub القائم يستدعي rpc/http_get ويعطي اليوم ٢٠٠؛ بعد هذا
-- الترحيل يجب أن يعطي 404 PGRST202. يُشغَّل فورًا بعد التطبيق.
--
-- وجُرِّب النقل نفسه على المحاكاة (معاملةٌ رُجِعت): create extension http
-- schema extensions نجح، ١٤ دالّةً انتقلت، وصفرٌ بقي في public.
--
-- ══ ما الذي يتغيّر في السلوك ══
-- لا شيء. الدوالّ نفسها بحرفيّتها التزامنيّة، والمراقبات الثلاث تشير
-- إليها باسمٍ مؤهَّلٍ جديد فقط. لا إعادة بناء ولا آلة حالة.
--
-- ══ الجرد قبل التنفيذ (مقيسٌ لا مُقدَّر) ══
--   دوالّ الامتداد في public: ١٩، وأنواعه: ١٠
--   المستهلكون في القاعدة كلّها: ثلاث مراقباتٍ فقط
--     check_domain_expiry     — سطر ١٣
--     check_platform_health   — أسطر ٨، ٣٧، ٤١، ٥١، ٦١، ٦٤، ٦٥، ٦٧
--     check_visual_integrity  — أسطر ٨، ٩، ١٦، ٣٨
--   (notify_telegram وsweep_alert_outbox تستعملان net.http_post — لا شأن لهما)
--   صفر عمودٍ في أيّ جدولٍ من أنواع الامتداد ⇒ DROP بلا CASCADE يمرّ نظيفًا
--   q20 يعدّ دوالّ public: ١٥٩ اليوم ⇒ ١٤٠ بعد النقل (١٥٩ − ١٩)
--
-- التراجع: 0193_ROLLBACK_http_extension_to_public.sql (مكتوبٌ قبل هذا الملفّ)

-- ١) الامتداد ينتقل. الحذف بلا CASCADE عمدًا: إن تعلّق به شيءٌ لا نعلمه
--    سقطت الهجرة كلّها بدل أن تجرف معها ما لم نحسبه.
drop extension http;
create extension http schema extensions;

-- ٢) المراقبات الثلاث تُعاد توجيهها. استبدالٌ مرتكز لا إعادة كتابة:
--    كلّ رمزٍ في هذه الدوالّ يبدأ بـ public.http هو من الامتداد بلا
--    استثناء (تحقّقٌ سطريّ كامل أعلاه)، وnet.http_request_queue لا تبدأ به.
do $mig$
declare r record; d text; d2 text;
begin
  for r in select unnest(array['check_platform_health','check_visual_integrity','check_domain_expiry']) as fname
  loop
    select pg_get_functiondef(oid) into d from pg_proc
     where proname = r.fname and pronamespace='public'::regnamespace;
    if d is null then raise exception 'الدالّة % غير موجودة', r.fname; end if;

    d2 := replace(d, 'public.http', 'extensions.http');
    if d2 = d then raise exception 'لا مرجعَ public.http في % — الجرد لم يعد صحيحًا', r.fname; end if;
    execute d2;
  end loop;
end $mig$;

-- ٣) q20: ١٥٩ ⇒ ١٤٠
do $mig2$
declare d text; d2 text;
begin
  select pg_get_functiondef(oid) into d from pg_proc
   where proname='run_critical_checks' and pronamespace='public'::regnamespace;
  d2 := replace(d, 'and p.prokind=''f'') = 159', 'and p.prokind=''f'') = 140');
  if d2 = d then raise exception 'مرساة عدّاد الدوالّ (159) لم تُطابق'; end if;
  execute d2;
end $mig2$;

-- ٤) حارسٌ دائم w56: لا يعود الامتداد إلى المخطّط المكشوف، ولا تعود
--    مراقبةٌ تشير إليه هناك. الشرطان معًا: الأوّل يمسك إعادة التثبيت،
--    والثاني يمسك من يكتب public.http في مراقبةٍ بعد اليوم.
do $mig3$
declare d text; d2 text; v_new text;
begin
  select pg_get_functiondef(oid) into d from pg_proc
   where proname='run_critical_checks' and pronamespace='public'::regnamespace;

  v_new :=
       E'    (''w56_http_ext_outside_public'',\n'
    || E'       not exists (select 1 from pg_depend dp\n'
    || E'                     join pg_extension ex on ex.oid = dp.refobjid and ex.extname = ''http''\n'
    || E'                     join pg_proc pr on pr.oid = dp.objid\n'
    || E'                     join pg_namespace ns on ns.oid = pr.pronamespace\n'
    || E'                    where dp.refclassid = ''pg_extension''::regclass\n'
    || E'                      and dp.classid = ''pg_proc''::regclass\n'
    || E'                      and ns.nspname = ''public'')\n'
    || E'       and not exists (select 1 from pg_proc pr\n'
    || E'                        where pr.pronamespace = ''public''::regnamespace\n'
    || E'                          and pr.proname in (''check_platform_health'',''check_visual_integrity'',\n'
    || E'                                             ''check_domain_expiry'')\n'
    || E'                          and position(''public.http'' in pg_get_functiondef(pr.oid)) > 0)),\n';

  d2 := replace(d, E'    (''q20_schema_no_drift'',', v_new || E'    (''q20_schema_no_drift'',');
  if d2 = d then raise exception 'مرساة q20 لم تُطابق'; end if;
  execute d2;
end $mig3$;

-- ٥) تحقّقٌ بعديّ داخل المعاملة نفسها: إن سقط أيٌّ منه لم يُودَع شيء
do $verify$
declare v_fail text; v_w56 boolean; v_pub int; v_ext int;
        v_h jsonb; r record; v_left int;
begin
  -- لا دالّةَ من الامتداد بقيت في public، وكلّها في extensions
  select count(*) into v_pub from pg_depend dp
    join pg_extension ex on ex.oid=dp.refobjid and ex.extname='http'
    join pg_proc pr on pr.oid=dp.objid
    join pg_namespace ns on ns.oid=pr.pronamespace
   where dp.refclassid='pg_extension'::regclass and dp.classid='pg_proc'::regclass
     and ns.nspname='public';
  if v_pub <> 0 then raise exception 'بقيت % دالّةً للامتداد في public', v_pub; end if;

  select count(*) into v_ext from pg_depend dp
    join pg_extension ex on ex.oid=dp.refobjid and ex.extname='http'
    join pg_proc pr on pr.oid=dp.objid
    join pg_namespace ns on ns.oid=pr.pronamespace
   where dp.refclassid='pg_extension'::regclass and dp.classid='pg_proc'::regclass
     and ns.nspname='extensions';
  if v_ext <> 19 then raise exception 'دوالّ الامتداد في extensions = % لا ١٩', v_ext; end if;

  -- لا مراقبةَ بقي فيها مرجعٌ إلى public.http
  for r in select proname from pg_proc
            where pronamespace='public'::regnamespace
              and proname in ('check_platform_health','check_visual_integrity','check_domain_expiry')
  loop
    select position('public.http' in pg_get_functiondef(p.oid)) into v_left
      from pg_proc p where p.proname = r.proname and p.pronamespace='public'::regnamespace;
    if v_left > 0 then raise exception 'بقي مرجع public.http في %', r.proname; end if;
  end loop;

  -- المراقبات الثلاث تعمل فعلًا — لا مجرّد تُترجَم
  v_h := public.check_platform_health();
  if (v_h->'homepage'->>'ok')::boolean is not true then
    raise exception 'الصفحة الرئيسيّة: %', (v_h->'homepage')::text; end if;
  if (v_h->'restaurant_page'->>'ok')::boolean is not true then
    raise exception 'صفحة المطعم: %', (v_h->'restaurant_page')::text; end if;
  if (v_h->'anon_rest_api'->>'ok')::boolean is not true then
    raise exception 'واجهة anon: %', (v_h->'anon_rest_api')::text; end if;
  if (v_h->'booking_writepath'->>'ok')::boolean is not true then
    raise exception 'مسار الحجز: %', (v_h->'booking_writepath')::text; end if;

  perform public.check_visual_integrity();
  perform public.check_domain_expiry();

  -- الحارس وشبكة الفحوص
  select pass into v_w56 from public.run_critical_checks()
   where name='w56_http_ext_outside_public';
  if v_w56 is null then raise exception 'w56 لم يُضف'; end if;
  if not v_w56 then raise exception 'w56 راسب فور إضافته'; end if;

  select coalesce(string_agg(name,'، ') filter (where not pass),'—') into v_fail
    from public.run_critical_checks();
  if v_fail <> '—' then raise exception 'فحوصٌ راسبة: %', v_fail; end if;
end
$verify$;
