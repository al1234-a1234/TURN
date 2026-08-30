-- ============================================================================
--  الأساس: ترقيم الطابور مستقلٌّ لكلّ (فرع، قسم) — وحارسٌ بنيويٌّ يمنع التكرار.
--
--  ── ما كان قائمًا قبل هذا الترحيل (مقيسٌ على الإنتاج، لا مفترضًا) ──
--  • `set_waitlist_position` تحسب `max(position)+1` على `branch_id` وحده،
--    بلا تمييز قسم. فالمخزَّن رقمٌ عالميٌّ للفرع.
--  • **لا قيد** يمنع تكرار الرقم: لا فريدٌ ولا CHECK. سلامةُ الترقيم اليوم
--    مصادفةُ تسلسلِ إدراجٍ لا ضمانٌ بنيويّ.
--  • لكنّ **كلّ** ما يراه العميل والموظّف رتبةٌ **مشتقّة لكلّ قسم** أصلًا:
--      tv_queue            → row_number() partition by zone
--      waitlist_ticket_by_id / _status → ahead+1 بفلترة القسم
--      queue_push_targets ×٣ → row_number داخل مجموعةٍ مفلترةٍ بالقسم
--      شاشة الاستقبال      → i+1 داخل عمود القسم (في الواجهة)
--    فالمعروض لكلّ قسم، والمخزَّن عالميّ — تناقضٌ صامتٌ يعمل بالصدفة.
--
--  ── والخطر الحقيقيّ في هذا التناقض ──
--  رقمان متساويان في نفس (فرع، قسم) يجعلان ترتيب `row_number` بينهما
--  **غير محدَّد**: قد ينقلب بين قراءةٍ وأخرى، فيرى العميل رقمه يتبدّل بلا
--  سبب. ولا شيء اليوم يمنع ذلك ولا يكشفه — «أخضرُ لكنّه لا يعمل».
--
--  ── ما يفعله هذا الترحيل ──
--  ١) الترقيم لكلّ (فرع، قسم): المخزَّن يوافق المعروض بدل أن يناقضه.
--  ٢) قيد `EXCLUDE ... WHERE ... DEFERRABLE INITIALLY DEFERRED` يمنع التكرار
--     بنيويًّا. واختير الاستثناء لا الفهرس الفريد لسببٍ قاطع: الفهرس الفريد
--     **الجزئيّ لا يقبل التأجيل**، والقيد الفريد **المؤجَّل لا يقبل WHERE** —
--     والاستثناء وحده يجمعهما. وهو مثبَتٌ عمليًّا لا نظريًّا (أدناه).
--  ٣) `guest_status_by_phone` تعرض الرتبة المشتقّة لا الرقم الخام — وهي
--     المصدر الوحيد الباقي الذي كان يعرض رقمًا مخالفًا لتذكرة العميل.
--  ٤) فحوصٌ دائمة تكشف عودة الخلل صامتًا.
--
--  ── إثباتاتٌ حيّة على turn-simulation قبل الكتابة (لا تحليل) ──
--  • القيد أُنشئ فعلًا جزئيًّا ومؤجَّلًا معًا.
--  • عكسُ ترتيبٍ كامل ١،٢،٣ → ٣،٢،١ في عبارةٍ واحدة **مرّ وأُودع** —
--    وهو ما يفشل حتمًا تحت فهرسٍ فريدٍ غير مؤجَّل.
--  • تكرارٌ حقيقيّ يبقى بعد الإيداع **رُفض** بـ23P01.
--  • `inside#1` و`outside#1` يتعايشان (جوهر الاستقلال).
--  • صفٌّ منتهٍ بنفس رقم صفٍّ حيّ مقبول (الجزئيّة تعمل).
--
--  ── لماذا لا يوجد فحصُ «١..ن متّصلة» ──
--  قِيس حيًّا: إجلاس الأوسط من ١،٢،٣ يترك الأحياء على `1,3` — فجوةٌ في
--  التشغيل الطبيعيّ تمامًا، لأنّ الإزالة لا تُعيد الترقيم. فجعلُ الاتّصال
--  فحصًا يجعله أحمر عند أوّل إجلاسٍ الليلة. والفجوة **غير مرئيّة** لأحد:
--  كلّ العرض مشتقّ. فالثابت الحقيقيّ الذي يُحرَس هو **عدم التكرار وعدم
--  الفراغ**، لا الاتّصال. (إعادةُ الترقيم عند كلّ إزالة تغييرٌ في مسار
--  الإجلاس الحرج، يخصّ مرحلةً لاحقة بإذنٍ صريح.)
--
--  ── حالة بيانات الإنتاج لحظة الكتابة ──
--  صفر صفٍّ حيّ · صفر تكرار · صفر فجوة · صفر position فارغ.
--  فلا ترحيل بياناتٍ ولا تعارضَ محتملٌ عند إنشاء القيد.
--
--  ── التراجع (ثلاثة أسطر، آمنةٌ وطابورٌ فيه عملاء) ──
--    alter table public.waitlist_entries drop constraint waitlist_live_pos_unique;
--    ثمّ إعادة set_waitlist_position إلى بصمتها السابقة 7b5832db621db299e6426b8c392123ea
--    ثمّ إعادة w3_no_duplicate_live_pos إلى صيغته العالميّة (بلا zone).
--  الأرقام المخزَّنة تبقى كما هي، والعرض مشتقٌّ أصلًا — فلا يرى العميل قفزة.
-- ============================================================================

-- (١) الترقيم لكلّ (فرع، قسم).
--     يبقى `FOR UPDATE` على صفّ الفرع كما هو: هو ما يُسلسِل الإدراجات
--     المتزامنة فلا يقرأ اثنان نفس الـmax. لا يُغيَّر ترتيب الأقفال في هذا
--     الترحيل عمدًا — أيّ مسارٍ جديدٍ يعيد الترتيب يلتزم بنفس القفل أوّلًا.
create or replace function public.set_waitlist_position()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.position is null then
    perform 1 from public.branches where id = new.branch_id for update;

    select coalesce(max(w.position), 0) + 1
      into new.position
      from public.waitlist_entries w
     where w.branch_id = new.branch_id
       and w.zone is not distinct from new.zone
       and w.status in ('waiting', 'notified');
  end if;
  return new;
end;
$function$;

-- (٢) الحارس البنيويّ. مؤجَّلٌ كي تمرّ إعادةُ ترتيبٍ كاملةٍ داخل معاملةٍ
--     واحدة (تصادمٌ لحظيّ أثناء الإزاحة مسموح، والنتيجة النهائيّة وحدها
--     تُفحص عند الإيداع)، وجزئيٌّ كي لا تصطدم الصفوف المنتهية بالحيّة.
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'waitlist_live_pos_unique') then
    alter table public.waitlist_entries
      add constraint waitlist_live_pos_unique
      exclude using gist (branch_id with =, zone with =, "position" with =)
      where (status in ('waiting','notified'))
      deferrable initially deferred;
  end if;
end
$mig$;

-- (٣) `/api/my-status` كان المصدر الوحيد الباقي الذي يعرض الرقم الخام،
--     فيرى العميل على صفحته رقمًا ويرى على تذكرته رقمًا آخر. الآن يعرض
--     نفس حساب `waitlist_ticket_by_id` حرفيًّا: عددُ من أمامه في نفس
--     (الفرع، القسم) خلال آخر ٨ ساعات، زائد واحد.
--     لم يتغيّر شيءٌ آخر في الدالّة: نفس الحدود، نفس السجلّ، نفس المخرجات.
create or replace function public.guest_status_by_phone(p_phone text, p_ip text)
 returns table(kind text, status text, at timestamp with time zone, party_size integer, "position" integer, venue_name text, venue_slug text, id uuid)
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_p text; v_ip text; v_salt text; v_ok boolean; v_n integer := 0;
begin
  v_p := public.norm_phone_input(p_phone);
  if length(v_p) <> 9 then return; end if;
  v_ip := coalesce(nullif(btrim(p_ip), ''), 'unknown');
  select s.salt into v_salt from public.app_salt s limit 1;

  v_ok := public.check_rate('gstat:p:'  || v_p,  60,  interval '1 hour');
  if v_ok then v_ok := public.check_rate('gstat:ip:' || v_ip, 120, interval '1 hour'); end if;
  if v_ok and public.check_rate('gstat:ipn:' || v_ip || ':' || v_p, 1, interval '1 day') then
    v_ok := public.check_rate('phone_lookup:ipd:' || v_ip, 20, interval '1 day');
  end if;

  if not v_ok then
    insert into public.phone_lookup_log (endpoint, phone_hash, ip_hash, result_count)
    values ('my-status', encode(extensions.digest(v_salt || v_p, 'sha256'), 'hex'),
            encode(extensions.digest(v_salt || v_ip, 'sha256'), 'hex'), -1);
    return;
  end if;

  return query
  select 'turn'::text, w.status::text, w.joined_at, w.party_size,
         (select count(*)::int + 1
            from public.waitlist_entries w2
           where w2.branch_id = w.branch_id
             and w2.zone is not distinct from w.zone
             and w2.status in ('waiting','notified')
             and w2."position" < w."position"
             and w2.joined_at > now() - interval '8 hours'),
         r.name, r.slug, w.id
  from public.waitlist_entries w
  join public.customers c on c.id = w.customer_id
  join public.branches b on b.id = w.branch_id
  join public.restaurants r on r.id = b.restaurant_id
  where right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 9) = v_p
    and w.status in ('waiting','notified')
  union all
  select 'reservation'::text, rs.status::text, rs.reserved_at, rs.party_size, null::int, r.name, r.slug, null::uuid
  from public.reservations rs
  join public.customers c on c.id = rs.customer_id
  join public.branches b on b.id = rs.branch_id
  join public.restaurants r on r.id = b.restaurant_id
  where right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 9) = v_p
    and rs.status in ('pending','confirmed')
    and rs.reserved_at > now() - interval '1 hour'
  order by 3;

  get diagnostics v_n = row_count;
  insert into public.phone_lookup_log (endpoint, phone_hash, ip_hash, result_count)
  values ('my-status', encode(extensions.digest(v_salt || v_p, 'sha256'), 'hex'),
          encode(extensions.digest(v_salt || v_ip, 'sha256'), 'hex'), v_n);
end $function$;

-- (٤) الرصد. `w3_no_duplicate_live_pos` القائم عالميٌّ للفرع، وكان سيتحوّل
--     أحمرَ فورًا لأنّ `داخل#١` و`خارج#١` تكرارٌ في نظره — فيُوسَّع بالقسم
--     عمدًا وموثَّقًا (لا إسكات: الشرط صار أدقّ لا أضعف). ويُضاف حارسان.
do $mig$
declare d text; d2 text;
begin
  if not exists (select 1 from pg_proc where proname='run_critical_checks' and pronamespace='public'::regnamespace) then
    raise notice 'run_critical_checks غير موجودة (محاكاة) — تخطّي الفحوص';
    return;
  end if;
  select pg_get_functiondef(oid) into d
    from pg_proc where proname='run_critical_checks' and pronamespace='public'::regnamespace;

  -- أ) توسيع فحص التكرار ليصير لكلّ (فرع، قسم)
  d2 := replace(d,
    'group by w.branch_id, w."position"',
    'group by w.branch_id, w.zone, w."position"');
  if d2 = d then
    raise exception 'لم أجد مرساة w3_no_duplicate_live_pos — توقّف قبل كسر الفحص.';
  end if;

  -- ب) حارسان جديدان قبل q20
  if position('w38_live_pos_not_null' in d2) = 0 then
    d2 := replace(d2, E'    (\'q20_schema_no_drift\',',
         E'    (\'w38_live_pos_not_null\',   not exists(\n'
      || E'                                   select 1 from public.waitlist_entries w\n'
      || E'                                    where w.status in (\'waiting\',\'notified\')\n'
      || E'                                      and w."position" is null)),\n'
      || E'    (\'w39_live_pos_constraint\',  exists(select 1 from pg_constraint\n'
      || E'                                   where conname=\'waitlist_live_pos_unique\'\n'
      || E'                                     and contype=\'x\' and condeferrable)),\n'
      || E'    (\'w40_pos_trigger_per_zone\', (select pg_get_functiondef(oid) like \'%zone is not distinct from new.zone%\'\n'
      || E'                                   from pg_proc where proname=\'set_waitlist_position\')),\n'
      || E'    (\'q20_schema_no_drift\',');
  end if;

  execute d2;
end
$mig$;

-- المتوقَّع بعد التطبيق على الإنتاج: ٢٠٨/٢٠٨ خضراء
-- (٢٠٥ + w38 + w39 + w40)، وq20 بلا تحريك (لا دالّة جديدة ولا جدول ولا سياسة
-- ولا مفتاح أجنبيّ — والقيد استثناءٌ لا يُعدّ في أيٍّ من الأربعة).
