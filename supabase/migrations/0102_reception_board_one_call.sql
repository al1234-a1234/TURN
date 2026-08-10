-- شاشة الاستقبال كانت تدفع ربع ثانية لتقرأ طابورًا ممتلئًا — والسبب في
-- الحراسة لا في البيانات.
--
-- قِسْتُها على فرعٍ فيه ٢٩٦ منتظرًا (معاملةٌ مُلغاة على الإنتاج):
--
--   قراءة waitlist_entries وحدها ......................  2 مللي
--   بعد الانضمام إلى customers ....................... 250 مللي
--
-- والفرق كلّه في سياسة القراءة على `customers`:
--   using (staff_can_read_customer(id))
-- دالّةٌ SECURITY DEFINER لا يستطيع المخطِّط تسطيحها، فتُنادى **مرّةً لكلّ
-- صفّ**؛ وهي بدورها تنادي `my_branch_ids()` مرّتين — و`my_branch_ids`
-- تجمع فروع المستخدم بضمٍّ كامل في كلّ نداء. أي ٥٩٢ نداءً لجمع الفروع
-- نفسه ٢٩٦ مرّة، لتُجيب سؤالًا واحدًا: «هل هذا الفرع فرعُك؟».
--
-- فبدل تخفيف الدالّة أو إعادة كتابة السياسة — والسياسة تُقرأ من جداول
-- تُشير سياساتُها إلى `customers` نفسها، فتسطيحُها يعني دورةً لا نهائية —
-- سُئل السؤال مرّةً واحدة: تتحقّق الدالّة من ملكيّة الفرع في أوّل سطر، ثم
-- تقرأ الطابور والأسماء بضمٍّ عاديّ.
--
--   بعد التغيير .......................................  4.7 مللي  (٥٣×)
--
-- والحراسة أضيق لا أوسع: نفس شرط سياسة `waitlist_entries` حرفًا بحرف
-- (فرعٌ من فروعي أو مديرُ منصّة)، والرفض **استثناء 42501 لا صفر صفوف** —
-- لأنّ أخطر كذبةٍ في هذه الشاشة طابورٌ فارغ: يقرأه الموظّف «لا أحد ينتظر»
-- فيكفّ عن المناداة والناس واقفون. الاستثناء يرفع شاشة «تعذّر التحميل».
--
-- تحقّقات العزل (معاملة مُلغاة، أربع هويّات):
--   مسجَّلٌ غريب يطلب فرع Eficto ................... 42501 ✓
--   موظّف مطعمٍ آخر يطلب فرع Eficto ................ 42501 ✓
--   زائر (anon) ينادي الدالّة ....................... 42501 ✓ (لا EXECUTE)
--   موظّف الفرع يطلب فرعه ........................... نجح ✓
create or replace function public.staff_branch_queue(p_branch_id uuid)
returns table (
  id uuid,
  customer_id uuid,
  "position" integer,
  party_size integer,
  zone text,
  status public.waitlist_status,
  joined_at timestamptz,
  confirmed_at timestamptz,
  distance_m integer,
  full_name text,
  phone text
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if not (public.is_platform_admin()
          or p_branch_id = any (coalesce(public.my_branch_ids(), array[]::uuid[]))) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
    select w.id, w.customer_id, w."position", w.party_size, w.zone, w.status,
           w.joined_at, w.confirmed_at, w.distance_m, c.full_name, c.phone
      from public.waitlist_entries w
      join public.customers c on c.id = w.customer_id
     where w.branch_id = p_branch_id
       and w.status in ('waiting', 'notified')
     order by w."position" asc nulls last;
end
$fn$;

-- الزائر لا يناديها: أسماءُ العملاء وأرقامهم لا تخرج إلا لموظّفٍ مسجَّل
revoke all on function public.staff_branch_queue(uuid) from public, anon;
grant execute on function public.staff_branch_queue(uuid) to authenticated;
