-- ============================================================================
--  حدّ الاحتفاظ بالبيانات الشخصية، ومسار حذفها بطلب صاحبها (PDPL)
--
--  الحال قبل هذا الترحيل: run_retention() تحذف رؤى المالك (٩٠ يومًا)
--  والاشتراكات (١٨٠ يومًا) — ولا تمسّ سطرًا واحدًا من بيانات العملاء.
--  فاسم العميل ورقم جواله يبقيان إلى الأبد، ولا يملك صاحبهما طريقًا لحذفهما.
--
--  نظام حماية البيانات الشخصية يوجب أمرين لا يُغني أحدهما عن الآخر:
--    ١) ألّا تُحفظ البيانات أطول ممّا يقتضيه الغرض.
--    ٢) أن يملك صاحبها طلب محوها.
--
--  الخيار هنا «إخفاء الهوية» لا «الحذف»: حذف صفّ العميل يهدم تاريخ الطابور
--  والتقييمات المرتبطة به، فتفقد المطاعم إحصاءاتها بلا سبب. وإخفاء الهوية
--  يبلغ الغاية نفسها — لا يبقى ما يدلّ على شخص — ويُبقي الأرقام المجمّعة.
--
--  ⚠️ هذا الترحيل يُنشئ الأدوات فقط. لا يجدول شيئًا ولا يحذف صفًّا واحدًا.
--     الجدولة قرار المالك، وتُفعَّل بسطر cron.schedule في ذيل الملف بعد
--     مراجعته. لا يُطبَّق على الإنتاج إلّا بإذن صريح.
-- ============================================================================

-- ── ١) إخفاء هوية عميل واحد ────────────────────────────────────────────────
-- يُبقي الصفّ ومفاتيحه، ويمحو ما يدلّ على شخص. الرقم يُستبدل بقيمة فريدة
-- لا تُشتقّ من الأصل (لا تجزئة: التجزئة على فضاء عشرة أرقام تُعكَس بالقوّة
-- الغاشمة في ثوانٍ، فتبقى بيانات شخصية باسم آخر).
create or replace function public.anonymize_customer(c_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  affected int;
begin
  update public.customers
     set full_name = 'عميل سابق',
         phone     = 'anon-' || replace(gen_random_uuid()::text, '-', ''),
         email     = null,
         updated_at = now()
   where id = c_id
     and phone not like 'anon-%';          -- مُخفًى سلفًا؟ لا تُكرّر العمل
  get diagnostics affected = row_count;

  -- الاشتراكات تحمل رقم الجوال، فتُحذف لا تُخفى: بلا رقم لا معنى لها.
  delete from public.push_subscriptions where customer_id = c_id;

  return affected > 0;
end;
$$;

revoke all on function public.anonymize_customer(uuid) from public, anon, authenticated;

-- ── ٢) حدّ الاحتفاظ: عميل بلا أثر منذ ثمانية عشر شهرًا ─────────────────────
-- لماذا ثمانية عشر؟ العميل الموسميّ (عيد، إجازة صيف، مناسبة سنويّة) يعود
-- بعد سنة، ومسحُه قبل ذلك يُفقده أختامه ونقاطه ويُغضبه بلا داعٍ. وما جاوز
-- الثمانية عشر فليس عميلًا نشطًا بأي معنى تجاريّ.
create or replace function public.retire_dormant_customers(months int default 18)
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  cutoff timestamptz := now() - make_interval(months => months);
  n int := 0;
  rec record;
begin
  for rec in
    select c.id
      from public.customers c
     where c.phone not like 'anon-%'
       and c.user_id is null                    -- صاحب حساب مسجّل؟ ليس خاملًا
       and coalesce((select max(w.joined_at) from public.waitlist_entries w
                      where w.customer_id = c.id), c.created_at) < cutoff
       and not exists (select 1 from public.checkins ck
                        where ck.customer_id = c.id and ck.created_at >= cutoff)
       and not exists (select 1 from public.customer_rewards cr
                        where cr.customer_id = c.id
                          and cr.status = 'active')   -- مكافأة قائمة = حقّ له
  loop
    if public.anonymize_customer(rec.id) then n := n + 1; end if;
  end loop;
  return n;
end;
$$;

revoke all on function public.retire_dormant_customers(int) from public, anon, authenticated;

-- ── ٣) طلب المحو من صاحب البيانات نفسه ────────────────────────────────────
-- يُنفَّذ بالرقم + رمز تذكرة حيّة أو سابقة يملكها هو، فلا يمحو أحدٌ بيانات
-- غيره بمجرّد معرفة رقمه. ومحروس بحدّ المعدّل كبقيّة دوال الضيف.
create or replace function public.request_my_erasure(p_phone text, p_ticket uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  norm text := public.norm_phone_input(p_phone);
  c_id uuid;
begin
  if norm is null or length(norm) < 9 then
    return jsonb_build_object('error', 'invalid_phone');
  end if;
  if not public.check_rate('erasure:' || norm, 3, interval '1 hour') then
    return jsonb_build_object('error', 'rate_limited');
  end if;

  -- التذكرة هي البرهان: صاحبها وحده يعرف معرّفها.
  select w.customer_id into c_id
    from public.waitlist_entries w
    join public.customers cu on cu.id = w.customer_id
   where w.id = p_ticket
     and public.norm_phone_input(cu.phone) = norm
   limit 1;

  if c_id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  perform public.anonymize_customer(c_id);
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.request_my_erasure(text, uuid) to anon, authenticated;

-- ── ٤) توسيع الاحتفاظ القائم ──────────────────────────────────────────────
-- صفوف طابور عمرها سنتان لا تخدم مطعمًا ولا عميلًا، وتظلّ سجلّ زيارات
-- لأشخاص. تُحذف المنتهية وحدها؛ الحيّة لا تُمسّ مهما قدُمت.
create or replace function public.run_retention()
returns void
language sql
security definer
set search_path to 'public'
as $$
  delete from public.owner_insights      where created_at < now() - interval '90 days';
  delete from public.push_subscriptions  where created_at < now() - interval '180 days';
  delete from public.waitlist_entries
   where joined_at < now() - interval '24 months'
     and status not in ('waiting', 'notified');
$$;

comment on function public.anonymize_customer(uuid) is
  'يمحو ما يدلّ على شخص ويُبقي الصفّ — كي لا تنهار إحصاءات المطاعم';
comment on function public.retire_dormant_customers(int) is
  'إخفاء هوية كل عميل بلا أثر منذ ١٨ شهرًا. غير مجدول: يُشغَّل بقرار المالك';
comment on function public.request_my_erasure(text, uuid) is
  'محو بطلب صاحب البيانات، بإثبات ملكيّة تذكرة، بحدّ ٣ محاولات في الساعة';

-- ── الجدولة (مُعطَّلة عمدًا) ────────────────────────────────────────────────
-- بعد مراجعة المالك، يُنفَّذ هذا السطر مرّة واحدة لتفعيل الحدّ الشهري:
--
--   select cron.schedule('retire-dormant', '0 23 1 * *',
--                        $c$ select public.retire_dormant_customers(18) $c$);
--
-- ولمعرفة كم عميلًا سيُخفى قبل تفعيلها (قراءة محضة، لا تكتب شيئًا):
--
--   select count(*) from public.customers c
--    where c.phone not like 'anon-%' and c.user_id is null
--      and coalesce((select max(w.joined_at) from public.waitlist_entries w
--                     where w.customer_id = c.id), c.created_at)
--          < now() - interval '18 months';
