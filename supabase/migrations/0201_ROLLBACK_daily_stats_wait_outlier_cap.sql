-- ═══ تراجع ٠٢٠٠ — إزالة سقف الشواذ من avg_wait_seconds ═══
--
-- يُعيد `rollup_daily_stats` إلى حالها قبل ٠٢٠٠: متوسّطٌ بلا حدٍّ أدنى ولا
-- أعلى. يُطبَّق إن تبيّن أنّ السقف يُخفي حالةً مشروعة (مطعمٌ ينتظر فيه
-- الضيف أكثر من عشر ساعات فعلًا — وهو ما لا وجود له في بياناتنا اليوم).
--
-- ولا يمسّ صفًّا واحدًا من daily_stats القائمة: الدالّة تُعيد الحساب لليوم
-- الذي تُستدعى به، والصفوف التاريخية تبقى بقيمها. من أراد إرجاع القيم
-- القديمة فليعد تشغيل rollup_all_daily_stats للأيام المعنيّة بعد التراجع.
--
-- بإحلالٍ نصّيٍّ مرتكز لا بإعادة كتابة: إعادة الكتابة تُعيد معها أيّ انحرافٍ
-- حيٍّ لا نعلمه، والمرساة تسقط صاخبةً إن لم تُطابق.

do $rb$
declare d text; d2 text; v_new text; v_old text;
begin
  select pg_get_functiondef(oid) into d from pg_proc
   where proname = 'rollup_daily_stats' and pronamespace = 'public'::regnamespace;

  -- النصّ الذي أدخله ٠٢٠٠
  v_new :=
       E'    COALESCE(round(avg(EXTRACT(EPOCH FROM (seated_at - joined_at)))\n'
    || E'      FILTER (WHERE status = ''seated'' AND seated_at IS NOT NULL AND seated_at >= d_start AND seated_at < d_end\n'
    || E'              AND EXTRACT(EPOCH FROM (seated_at - joined_at)) >= 0\n'
    || E'              AND EXTRACT(EPOCH FROM (seated_at - joined_at)) <  36000))::int, 0),';

  -- النصّ الأصليّ الذي نعود إليه
  v_old :=
       E'    COALESCE(round(avg(EXTRACT(EPOCH FROM (seated_at - joined_at)))\n'
    || E'      FILTER (WHERE status = ''seated'' AND seated_at IS NOT NULL AND seated_at >= d_start AND seated_at < d_end))::int, 0),';

  d2 := replace(d, v_new, v_old);
  if d2 = d then raise exception 'مرساة سقف الشواذ لم تُطابق — لم يُطبَّق ٠٢٠٠ أو انحرفت الدالّة'; end if;
  execute d2;
end $rb$;

-- تحقّقٌ بعديّ: السقف زال، وحارس run_critical_checks لم يُكسَر
do $verify$
declare v_def text; v_riyadh boolean;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc
   where proname = 'rollup_daily_stats' and pronamespace = 'public'::regnamespace;

  if position('36000' in v_def) > 0 then
    raise exception 'السقف ما زال موجودًا بعد التراجع';
  end if;

  -- ‏rollup_riyadh_day في run_critical_checks يشترط بقاء هذا النصّ
  v_riyadh := v_def like '%Asia/Riyadh%';
  if not v_riyadh then
    raise exception 'ضاع Asia/Riyadh — الفحص rollup_riyadh_day سيسقط';
  end if;

  -- شبكة الفحوص على الإنتاج وحده — غيابها على المحاكاة تخطٍّ معلَن
  if to_regprocedure('public.run_critical_checks()') is null then
    raise notice 'run_critical_checks غائبة (محاكاة) — تُخطّى أكيدة الفحوص';
  elsif (select count(*) from public.run_critical_checks() where not pass and name = 'rollup_riyadh_day') > 0 then
    raise exception 'الفحص rollup_riyadh_day أحمر بعد التراجع';
  end if;
end
$verify$;
