-- ============================================================================
--  الإطفاء الفجريّ يتخطّى مستأجر النبض.
--
--  ── العطب، وكيف ظهر ──
--  مسبار /api/canary كان يردّ 503 «canary_not_configured» لأنّ CANARY_SECRET
--  سقط من بيئة Vercel. ولمّا ضُبط السرّ ظهر خلفه عطبٌ ثانٍ كان الأوّل يحجبه:
--
--    {"ok":false,"steps":[{"step":"branch","ok":true},
--                         {"step":"join","ok":false,
--                          "detail":"لا يوجد انتظار الآن — تفضّل مباشرةً"}]}
--
--  أي P0011 من 0167:135 — `queue_paused` على فرع النبض. والخطوة السابقة
--  خضراء، ووصولُ الخطأ إلى P0011 دليلٌ بذاته على أنّ ما قبله مرّ:
--  `accepts_waitlist` و`manually_closed` وساعات الدوام كلّها تُفحص قبله في
--  الدالّة نفسها (0167:99-103).
--
--  ── ولماذا لا يكفي فكّ الإيقاف باليد ──
--  الكرون `reset-manual-flags` (‏0 1 * * * — الرابعة فجرًا بالرياض) يُطفئ
--  طابور **كلّ** فرع كلّ ليلة. فأيّ فكِّ إيقافٍ يدويّ يعيش ساعاتٍ ثمّ يُلغى،
--  ويعود المسبار أحمر ويرسل تنبيه تلغرام كلّ ربع ساعة إلى الأبد.
--  والدليل مقيس: `فرع المراقبة` كان updated_at = 2026-09-02 01:00:00.27+00 —
--  دقيقة الكرون بالضبط.
--
--  ── ما لم يتغيّر، وهو الأهمّ ──
--  الإطفاء الفجريّ لفروع المطاعم الحقيقيّة **باقٍ كما هو حرفيًّا**. هو قرار
--  المالك الموثّق في 0150 بحجّته: «لا أقبل أن يكون اختراع انتظارٍ من العدم
--  ممكنًا أصلًا» — ألّا يأخذ أحدٌ دورًا في مطعمٍ فارغ فيظنّ غيرُه أنّ فيه
--  زحمة فلا يجيء. هذا الترحيل لا يمسّ تلك الحجّة ولا إفيكتو ولا بيتزا بيل:
--  يستثني مستأجر النبض وحده، وهو مطعمٌ صناعيّ مستثنًى أصلًا من الدليل
--  والبحث ولا مضيفَ له يفتح طابوره كلّ مساء.
--
--  ── والافتراض `true` لم يُقلب ──
--  `column_default` يبقى true. المطعم الجديد ما زال يولد بلا طابور كما قرّر
--  المالك؛ حارس w27_pause_default_closed يظلّ أخضر. المستثنى هو الإطفاء
--  المتكرّر على النبض وحده، لا الافتراض.
--
--  ── ولماذا لا يُعالَج في المسبار بدل القاعدة ──
--  جعلُ /api/canary يتساهل مع P0011 يقتل الغرض: المسبار يسأل «هل نجح إنسانٌ
--  في أخذ دوره؟» — فقبولُ «لم أستطع الانضمام» نجاحًا يجعله يردّ أخضر بينما
--  العميل واقفٌ على الباب. الخطأ صادق، والبيئة هي التي يجب أن تصلح.
-- ============================================================================

-- (١) الكرون: نفس الجملة، وشرطُ استثناءٍ واحدٌ مضاف.
--     ونصّ `queue_paused = true` باقٍ حرفيًّا — حارس w27_dawn_closes_not_opens
--     يفحص وجوده، وحذفه كان سيقلب المعنى من إطفاءٍ إلى فتح.
select cron.unschedule('reset-manual-flags')
 where exists (select 1 from cron.job where jobname='reset-manual-flags');

select cron.schedule('reset-manual-flags', '0 1 * * *', $cron$
  update public.branch_settings s
     set manually_closed = false, busy_now = false, queue_paused = true
   where (s.manually_closed or s.busy_now or not s.queue_paused)
     and not exists (select 1 from public.branches b
                      join public.restaurants r on r.id = b.restaurant_id
                     where b.id = s.branch_id and r.is_canary)
$cron$);

-- (٢) وفكُّ الإيقاف عن فروع النبض القائمة — الكرون لم يعد يُطفئها، لكنّه
--     أطفأها فعلًا في ليالٍ مضت ولا أحد يفتحها.
update public.branch_settings s
   set queue_paused = false
  from public.branches b
  join public.restaurants r on r.id = b.restaurant_id
 where b.id = s.branch_id and r.is_canary and s.queue_paused;

-- (٣) حارسان دائمان: العطب هذا صامتٌ بطبعه — لا يظهر إلّا بعد ليلةٍ كاملة،
--     وقد بقي مخفيًّا خلف 503 حتى اليوم. فيُرصد بنيويًّا لا بالتذكّر.
--     بإحلالٍ نصّيٍّ مرتكز على `pg_get_functiondef` لا بإعادة كتابة الدالّة
--     (الميثاق §٣-أ)، فلا يُستورَد انحرافٌ حيٌّ غير معروف.
do $mig$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='run_critical_checks';
  if v_def is null then raise exception 'run_critical_checks غير موجودة'; end if;

  if position('w29_dawn_spares_canary' in v_def) = 0 then
    v_def := replace(v_def, E'    (\'w28_push_log_names_sub\',',
      E'    (\'w29_dawn_spares_canary\', (select command like \'%is_canary%\'\n'
   || E'                                  from cron.job where jobname=\'reset-manual-flags\')),\n'
   || E'    (\'w29_canary_queue_open\', not exists (\n'
   || E'        select 1 from public.branch_settings s\n'
   || E'          join public.branches b on b.id = s.branch_id\n'
   || E'          join public.restaurants r on r.id = b.restaurant_id\n'
   || E'         where r.is_canary and s.queue_paused)),\n'
   || E'    (\'w28_push_log_names_sub\',');
  end if;

  execute v_def;
end
$mig$;

-- لا دالّة جديدة ولا عمود ولا سياسة ⇒ q20_schema_no_drift لا يتحرّك.
