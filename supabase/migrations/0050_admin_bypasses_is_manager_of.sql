-- الأدمن يفشل برفع صور/تعديل مطعم يستعرضه (مثال: Livoa) لأن is_manager_of()
-- لا تعرف عن platform_admins، رغم أن كل التوثيق يقول الأدمن يرى/يفعل كل
-- شيء (docs/... و my_branch_ids تخصّه صراحةً بالفعل). سياسات مبعثرة أضافت
-- "OR is_platform_admin()" يدويًّا عند بعض الاستدعاءات فقط (0013/0037/0039)
-- ونسيت غيرها (سياسات التخزين media، وسياسات restaurants/branches/menu في
-- 0038/0035/0009) — فتفاوت سلوك الأدمن حسب الجدول. الإصلاح عند المصدر:
-- is_manager_of نفسها تُرجع صحيحًا للأدمن، فيرث كل مستدعٍ لها الاستثناء دفعة واحدة.
create or replace function public.is_manager_of(rest_id uuid)
returns boolean language sql stable security definer set search_path to ''
as $function$
  select public.is_platform_admin()
      or exists (
        select 1 from public.staff s
        where s.user_id = (select auth.uid()) and s.restaurant_id = rest_id
          and s.is_active and s.role in ('owner','manager')
      );
$function$;
