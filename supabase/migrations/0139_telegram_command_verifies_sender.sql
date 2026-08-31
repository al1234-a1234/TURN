-- ═══════════════════════════════════════════════════════════════
-- ٠١٣٩ — أوامر تلغرام تتحقّق من المرسِل (توثيقُ واقعٍ قائم)
-- ═══════════════════════════════════════════════════════════════
--
-- ⚠ إعادةُ بناءٍ من التعريف الحيّ على الإنتاج (٣١ أغسطس ٢٠٢٦)، لا النصّ
--   الأصليّ. مطبَّقٌ فعلًا (version 20260828050913) وملفّه مفقود.
--
-- ── ما فعله ──
-- أضاف إلى `telegram_command` التحقّقَ من هويّة المرسِل قبل أيّ شيء:
--
--   select btrim(value) into v_owner from alert_config where key = 'telegram_chat_id';
--   if v_owner is null or v_owner = '' or btrim(coalesce(p_chat_id,'')) <> v_owner then
--     return null;
--   end if;
--
-- بدونه، **أيّ** محادثةٍ تصل إلى البوت تستطيع تنفيذ `/اقفل` على أيّ فرع —
-- أي إقفال مطعمٍ حيٍّ من هاتفٍ غريب. والدالّة `SECURITY DEFINER`، فالحارس
-- الوحيد هو هذا الشرط.
--
-- ── لماذا يهمّ ──
-- نسخة المستودع (`0137_telegram_operator_commands`) لا تحوي هذا الشرط.
-- فأيّ `create or replace` منها كان **يفتح الأوامر للعموم صامتًا** —
-- وهذا أخطر ما كشفه جردُ الترحيلات اليتيمة.
--   بصمة الجسم الحيّ: b49d44de12ab891f53621aace2ca9f6a
--
-- ولا تغييرَ سلوكٍ هنا: الدالّة قائمةٌ بهذا التعريف نفسه على الإنتاج الآن.

begin;

create or replace function public.telegram_command(p_chat_id text, p_cmd text, p_arg text DEFAULT ''::text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public', 'backup', 'pg_temp'
as $function$
declare
  v_out   text := '';
  v_row   record;
  v_n       int;
  v_total   int;
  v_fail    int;
  v_expired int;
  v_names   text;
  v_owner text;
  v_day   date := (now() at time zone 'Asia/Riyadh')::date;
  v_arg   text := btrim(coalesce(p_arg, ''));
begin
  select btrim(value) into v_owner from alert_config where key = 'telegram_chat_id';
  if v_owner is null or v_owner = '' or btrim(coalesce(p_chat_id, '')) <> v_owner then
    return null;
  end if;

  if p_cmd in ('الآن', 'الان', 'now') then
    v_out := '📍 الآن — ' || to_char(now() at time zone 'Asia/Riyadh', 'HH24:MI') || E'\n';
    for v_row in
      select r.name as rest, b.name as br,
             coalesce(s.manually_closed, false) as closed,
             count(w.id) filter (where w.status = 'waiting') as waiting,
             coalesce(max(extract(epoch from (now() - w.joined_at))/60)
                      filter (where w.status = 'waiting'), 0)::int as oldest_min
        from branches b
        join restaurants r on r.id = b.restaurant_id
        left join branch_settings s on s.branch_id = b.id
        left join waitlist_entries w on w.branch_id = b.id and w.status = 'waiting'
       where b.is_active and not r.is_canary
       group by r.name, b.name, s.manually_closed
       order by r.name
    loop
      v_out := v_out || E'\n' ||
        case when v_row.closed then '🔴 ' else '🟢 ' end ||
        v_row.rest || ' · ' || v_row.br || E'\n' ||
        '   ' || case when v_row.closed then 'مقفل يدويًّا' else 'مفتوح' end ||
        ' — في الانتظار: ' || v_row.waiting;
      if v_row.waiting > 0 then
        v_out := v_out || ' (أقدمهم ' || v_row.oldest_min || ' د)';
      end if;
    end loop;
    return v_out;
  end if;

  if p_cmd in ('اليوم', 'today') then
    select count(*) filter (where (w.joined_at at time zone 'Asia/Riyadh')::date = v_day),
           count(*) filter (where w.status = 'seated'
                              and (w.seated_at at time zone 'Asia/Riyadh')::date = v_day),
           count(*) filter (where w.status = 'cancelled'
                              and (w.joined_at at time zone 'Asia/Riyadh')::date = v_day),
           count(*) filter (where w.status = 'expired'
                              and (w.joined_at at time zone 'Asia/Riyadh')::date = v_day)
      into v_n, v_total, v_fail, v_expired
      from waitlist_entries w
      join branches b on b.id = w.branch_id
      join restaurants r on r.id = b.restaurant_id
     where not r.is_canary;

    v_out := '📊 اليوم ' || to_char(v_day, 'YYYY-MM-DD') || E'\n\n' ||
             'انضمّ: ' || v_n || E'\n' ||
             'جلس: ' || v_total || E'\n' ||
             'ألغى: ' || v_fail || E'\n' ||
             'انتهت مهلته: ' || v_expired;

    select round(avg(extract(epoch from (w.seated_at - w.joined_at))/60))::int
      into v_n
      from waitlist_entries w
      join branches b on b.id = w.branch_id
      join restaurants r on r.id = b.restaurant_id
     where not r.is_canary and w.status = 'seated' and w.seated_at is not null
       and (w.seated_at at time zone 'Asia/Riyadh')::date = v_day;
    if v_n is not null then
      v_out := v_out || E'\n' || 'متوسّط الانتظار: ' || v_n || ' د';
    end if;

    select count(*) into v_n from reviews
     where (created_at at time zone 'Asia/Riyadh')::date = v_day;
    v_out := v_out || E'\n' || 'تقييمات: ' || v_n;
    return v_out;
  end if;

  if p_cmd in ('اقفل', 'أقفل', 'close', 'افتح', 'إفتح', 'open') then
    if v_arg = '' then
      return '✋ اكتب اسم المطعم بعد الأمر. مثال: اقفل بيتزا';
    end if;

    select count(*) into v_n
      from branches b join restaurants r on r.id = b.restaurant_id
     where b.is_active and not r.is_canary
       and (r.name ilike '%' || v_arg || '%' or b.name ilike '%' || v_arg || '%');

    if v_n = 0 then
      return '❓ ما لقيت مطعمًا اسمه «' || v_arg || '». جرّب /الآن لترى الأسماء.';
    elsif v_n > 1 then
      return '⚠️ «' || v_arg || '» يطابق ' || v_n || ' فروع — حدِّد أكثر.';
    end if;

    update branch_settings s
       set manually_closed = (p_cmd in ('اقفل', 'أقفل', 'close')),
           updated_at = now()
      from branches b join restaurants r on r.id = b.restaurant_id
     where b.id = s.branch_id and b.is_active and not r.is_canary
       and (r.name ilike '%' || v_arg || '%' or b.name ilike '%' || v_arg || '%');

    select r.name || ' · ' || b.name into v_names
      from branches b join restaurants r on r.id = b.restaurant_id
     where b.is_active and not r.is_canary
       and (r.name ilike '%' || v_arg || '%' or b.name ilike '%' || v_arg || '%');

    if p_cmd in ('اقفل', 'أقفل', 'close') then
      return '🔴 أُقفل: ' || v_names || E'\n' ||
             'ملاحظة: يُفتح تلقائيًّا الساعة ٤ فجرًا (حارس النسيان). أرسل «افتح» لفتحه الآن.';
    else
      return '🟢 فُتح: ' || v_names;
    end if;
  end if;

  if p_cmd in ('فحص', 'check') then
    select count(*), count(*) filter (where not pass) into v_total, v_fail
      from public.run_critical_checks();
    if v_fail = 0 then
      return '🧪 ' || v_total || '/' || v_total || ' فحصًا ناجحًا ✓';
    end if;
    select string_agg(name, '، ') into v_names
      from public.run_critical_checks() where not pass;
    return '🔴 فشل ' || v_fail || ' من ' || v_total || E'\n' || v_names;
  end if;

  if p_cmd in ('نسخة', 'backup') then
    select 'آخر لقطة: ' ||
           to_char(at at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI') ||
           ' (' || round(extract(epoch from (now() - at))/3600) || ' ساعة) — ' ||
           total_rows || ' صفًّا'
      into v_names
      from backup.snap_log order by at desc limit 1;
    return coalesce('💾 ' || v_names, '⚠️ لا توجد لقطات بعد.');
  end if;

  return
    'أوامر دور:' || E'\n\n' ||
    '/الآن — حالة الفروع والانتظار الآن' || E'\n' ||
    '/اليوم — أرقام اليوم' || E'\n' ||
    '/اقفل <اسم> — إقفال فرع' || E'\n' ||
    '/افتح <اسم> — فتحه' || E'\n' ||
    '/فحص — شبكة الفحوص الحرجة' || E'\n' ||
    '/نسخة — آخر نسخة احتياطية';
end;
$function$;

commit;
