-- ═══════════════════════════════════════════════════════════════
-- ٠١٧١ — تصحيح بصمة q20 بعد ٠١٦٩
-- ═══════════════════════════════════════════════════════════════
--
-- ٠١٦٩ رفع عدّادَي الجداول (33→34) والدوالّ (145→149) ونسي عدّادَين:
--   • السياسات: queue_events أضاف سياستين (قراءة الموظّف + مدير المنصّة) ⇒ 71→73
--   • المفاتيح الخارجيّة: queue_events فيه ثلاثة (branch_id, entry_id, customer_id) ⇒ 40→43
--
-- فسقط q20_schema_no_drift على الإنتاج فور تطبيق ٠١٦٩ (٢١٢ فحصًا، فاشلٌ واحد).
-- ولم يظهر على المحاكاة لأنّها لا تملك run_critical_checks أصلًا — وهو النقص
-- الذي كان مُعلنًا صراحةً تحت «ما لم يُختبَر» في PR #82، فوقع بالضبط حيث قيل
-- إنّه غير مُختبَر.
--
-- وهذا تحديثُ مرجعٍ **عمديّ وموثَّق** لا إسكاتُ فحص (الميثاق §٢-٥، نمط ٠١٣٨
-- و٠١٥٩): الكائنات الجديدة مقصودةٌ ومراجَعة، فالبصمة تُسجّلها بدل أن تُخفيها.
do $mig$
declare d text; d2 text;
begin
  select pg_get_functiondef(oid) into d
    from pg_proc where proname='run_critical_checks' and pronamespace='public'::regnamespace;
  if d is null then raise exception 'run_critical_checks غير موجودة'; end if;

  d2 := replace(d, 'from pg_policies where schemaname=''public'') = 71',
                   'from pg_policies where schemaname=''public'') = 73');
  if d2 = d then raise exception 'مرساة عدّاد السياسات لم تُطابق'; end if;

  d := d2;
  d2 := replace(d, 'and c.contype=''f'') = 40', 'and c.contype=''f'') = 43');
  if d2 = d then raise exception 'مرساة عدّاد المفاتيح الخارجيّة لم تُطابق'; end if;

  execute d2;
end
$mig$;

-- المتوقَّع: ٢١٣/٢١٣ خضراء · q20 على 34 جدولًا · 149 دالّة · 73 سياسة · 43 مفتاحًا.
