-- ============================================================================
--  «أكّد الحضور ✓» على زيارةٍ ألغاها صاحبها — إصلاحُ أثرٍ خاطئ في سجلّ العميل.
--
--  ── ما وُجد بالضبط (اختبارٌ حيّ على turn-simulation، بمخطّطٍ مطابقٍ للإنتاج
--     بصمةً: join_waitlist_guest=2d259df1… · confirm_attendance=7aeeffa0… ·
--     guard_waitlist_status_transition=7a002789… — نفس بصمات الإنتاج حرفيًّا) ──
--
--  أوّلًا، ما ليس خللًا: confirm_attendance تحمل حارس حالةٍ صحيحًا. استدعاؤها
--  على صفٍّ ملغًى مسبقًا أرجع false ولم يكتب شيئًا (confirmed_at بقي null) —
--  مُختبَرٌ فعليًّا لا مُستنتَجًا. فالحارس موجود ويعمل.
--
--  الخلل في التتابع لا في الحارس: أطلقتُ confirm_attendance وcancel_waitlist_guest
--  متزامنتين حقيقيًّا (جلستان منفصلتان، قفلٌ استشاريّ كطلقة بداية، فارق ٦ms).
--  نجحتا كلتاهما — وهذا سليمٌ منطقيًّا: العميل أكّد ثمّ ألغى بعدها بلحظة.
--  لكنّ الصفّ استقرّ على status='cancelled' وconfirmed_at مضبوط.
--
--  ولماذا يهمّ؟ لأنّ src/app/dashboard/customers/[id]/page.tsx يعرض
--  « · أكّد الحضور ✓» لكلّ زيارةٍ فيها confirmed_at **بلا فحص الحالة**. فزيارةٌ
--  ألغاها العميل بأدبٍ تظهر للموظّف كأنّه أكّد حضوره ثمّ لم يأتِ — أي أنّ
--  السجلّ يظلم عميلًا فعل الصواب. (الشاشة الحيّة للاستقبال سليمة: تقصر على
--  waiting/notified أصلًا.)
--
--  ── الإصلاح ──
--  ١) محفّزٌ يمسح confirmed_at حين ينتقل الصفّ إلى حالةٍ تعني «لم يحضر»:
--     cancelled · expired · no_show. **وعمدًا لا يشمل seated** — من أكّد ثمّ
--     جلس فتأكيدُه صحيحٌ ويجب أن يبقى، وهو المسار السعيد لا خللًا.
--  ٢) تشديد confirm_attendance بقفل صفٍّ صريح (for update) وإعادة فحص الحالة
--     تحته: يغلق أي نافذةٍ تتخلّل بين القراءة والكتابة مستقبلًا. السلوك
--     الظاهر لا يتغيّر لمن يستدعيها على صفٍّ نشط.
--
--  ⚠️ غير مطبَّق — للمراجعة والتطبيق بعد انتهاء الخدمة الحيّة بإذنٍ صريح.
-- ============================================================================

create or replace function public.clear_confirmed_on_no_show()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  -- «لم يحضر» يمحو التأكيد. «جلس» يُبقيه — فهو إثباتُ أنّ التأكيد صدق.
  if new.status in ('cancelled','expired','no_show')
     and new.status is distinct from old.status then
    new.confirmed_at := null;
  end if;
  return new;
end;
$function$;

comment on function public.clear_confirmed_on_no_show() is
  'يمسح confirmed_at عند الانتقال إلى cancelled/expired/no_show فقط — لا عند seated.';

drop trigger if exists trg_clear_confirmed_on_no_show on public.waitlist_entries;
create trigger trg_clear_confirmed_on_no_show
  before update of status on public.waitlist_entries
  for each row when (old.status is distinct from new.status)
  execute function public.clear_confirmed_on_no_show();

-- (٢) تشديد الحارس بقفلٍ صريح — لا تغيير في السلوك الظاهر.
create or replace function public.confirm_attendance(p_entry_id uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_status text;
  v_hit int;
begin
  -- نقفل الصفّ أوّلًا ثمّ نفحص حالته تحت القفل: لا نافذة بين الفحص والكتابة.
  select w.status::text into v_status
    from public.waitlist_entries w
   where w.id = p_entry_id
     and (w.joined_at at time zone 'Asia/Riyadh')::date
       = (now() at time zone 'Asia/Riyadh')::date
   for update;

  if v_status is null or v_status not in ('waiting','notified') then
    return false;
  end if;

  update public.waitlist_entries w
     set confirmed_at = now()
   where w.id = p_entry_id
     and w.status in ('waiting','notified');
  get diagnostics v_hit = row_count;
  return v_hit > 0;
end;
$function$;

-- المتوقَّع بعد التطبيق:
--  • confirm ثمّ cancel متزامنين ← الصفّ cancelled وconfirmed_at = null.
--  • confirm ثمّ seated ← confirmed_at باقٍ (المسار السعيد سليم).
--  • confirm على صفٍّ ملغًى ← false، بلا كتابة (كما هو اليوم).
