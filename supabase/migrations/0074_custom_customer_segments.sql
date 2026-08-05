-- تصنيفات العملاء التي يصنعها المالك بنفسه («فضّي» عند ٥ زيارات، «ذهبي» عند ١٠…).
--
-- كانت الشرائح مثبّتة في الكود (vip · returning · new · dormant) داخل
-- grant_reward_to_segment، فلا يملك المالك إنشاء شريحته ولا تسميتها ولا تغيير
-- حدّها. وهذه هي القيمة التي يشتريها صاحب المطعم فعلًا: أن يعرّف «عميله المميّز»
-- بمقياسه هو لا بمقياسنا.
--
-- القاعدة تُحسب لحظةَ الاستعلام من customer_restaurant (visits و last_visit)،
-- فلا جدول عضوية يحتاج مزامنة ولا وظيفة ليلية تعيد البناء: العميل يدخل الشريحة
-- ويخرج منها تلقائيًّا مع كل زيارة.

CREATE TABLE public.customer_segments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name           text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  -- الحدّ الأدنى للزيارات (شامل)
  min_visits     integer NOT NULL DEFAULT 0 CHECK (min_visits >= 0 AND min_visits <= 10000),
  -- الحدّ الأعلى (شامل) — NULL يعني بلا سقف
  max_visits     integer CHECK (max_visits IS NULL OR (max_visits >= 0 AND max_visits <= 10000)),
  -- شرط اختياري: لم يزر منذ كذا يومًا (لشرائح الاسترجاع)
  inactive_days  integer CHECK (inactive_days IS NULL OR (inactive_days > 0 AND inactive_days <= 3650)),
  sort_order     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_segments_range CHECK (max_visits IS NULL OR max_visits >= min_visits)
);

-- لا شريحتان بالاسم نفسه في المطعم الواحد — الاسم هو ما يراه المالك ويختار به
CREATE UNIQUE INDEX customer_segments_name_uniq
  ON public.customer_segments (restaurant_id, lower(btrim(name)));
CREATE INDEX customer_segments_restaurant_idx
  ON public.customer_segments (restaurant_id, sort_order);

ALTER TABLE public.customer_segments ENABLE ROW LEVEL SECURITY;

-- القراءة والكتابة لمن يملك صلاحية «العملاء» في مطعمه وحده
CREATE POLICY "staff reads own segments" ON public.customer_segments
  FOR SELECT TO authenticated
  USING (public.staff_has_perm(restaurant_id, 'customers') OR public.is_platform_admin());

CREATE POLICY "staff writes own segments" ON public.customer_segments
  FOR ALL TO authenticated
  USING (public.staff_has_perm(restaurant_id, 'customers') OR public.is_platform_admin())
  WITH CHECK (public.staff_has_perm(restaurant_id, 'customers') OR public.is_platform_admin());


-- شرط العضوية في مكانٍ واحد: يستعمله العدّ والمنح معًا فلا يفترقان أبدًا.
-- (لو تفرّق التعريفان لعُرض للمالك عددٌ ومُنح لعددٍ آخر — وهو خطأ لا يُكتشف.)
CREATE OR REPLACE FUNCTION public.segment_member_ids(p_segment_id uuid)
 RETURNS TABLE(customer_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select cr.customer_id
  from public.customer_segments s
  join public.customer_restaurant cr on cr.restaurant_id = s.restaurant_id
  where s.id = p_segment_id
    and (public.staff_has_perm(s.restaurant_id, 'customers') or public.is_platform_admin())
    and cr.is_blocked = false
    and cr.visits >= s.min_visits
    and (s.max_visits is null or cr.visits <= s.max_visits)
    and (s.inactive_days is null
         or (cr.last_visit is not null and cr.last_visit < now() - make_interval(days => s.inactive_days)))
    -- حسابٌ مربوط بفرع لا يرى إلا عملاء فرعه (نفس قاعدة grant_reward_to_segment)
    and (
      public.caller_branch_id(s.restaurant_id) is null
      or exists (select 1 from public.waitlist_entries w
                 where w.customer_id = cr.customer_id
                   and w.branch_id = public.caller_branch_id(s.restaurant_id))
      or exists (select 1 from public.reservations r
                 where r.customer_id = cr.customer_id
                   and r.branch_id = public.caller_branch_id(s.restaurant_id))
    );
$function$;

REVOKE ALL ON FUNCTION public.segment_member_ids(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.segment_member_ids(uuid) TO authenticated;


-- شرائح المطعم مع عدد كلٍّ منها — لعرضها في اللوحة بضربةٍ واحدة
CREATE OR REPLACE FUNCTION public.customer_segments_with_counts(p_restaurant_id uuid)
 RETURNS TABLE(id uuid, name text, min_visits integer, max_visits integer,
               inactive_days integer, sort_order integer, member_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select s.id, s.name, s.min_visits, s.max_visits, s.inactive_days, s.sort_order,
         (select count(*)::int from public.segment_member_ids(s.id))
  from public.customer_segments s
  where s.restaurant_id = p_restaurant_id
    and (public.staff_has_perm(p_restaurant_id, 'customers') or public.is_platform_admin())
  order by s.sort_order, s.created_at;
$function$;

REVOKE ALL ON FUNCTION public.customer_segments_with_counts(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.customer_segments_with_counts(uuid) TO authenticated;


-- منح هديّة لشريحةٍ مخصّصة — يعيد عدد من مُنحوا فعلًا
CREATE OR REPLACE FUNCTION public.grant_reward_to_custom_segment(
    p_segment_id uuid, p_kind text, p_title text, p_value numeric,
    p_value_kind text, p_description text, p_code text, p_expires_at timestamptz)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n integer; v_rest uuid;
begin
  select restaurant_id into v_rest from public.customer_segments where id = p_segment_id;
  if v_rest is null then return 0; end if;
  if not (public.staff_has_perm(v_rest, 'customers') or public.is_platform_admin()) then
    return 0;
  end if;
  if coalesce(btrim(p_title), '') = '' then return 0; end if;

  insert into public.customer_rewards
    (restaurant_id, customer_id, kind, title, value, value_kind, description, code, created_by, expires_at)
  select v_rest, m.customer_id,
         case when p_kind = 'discount' then 'discount' else 'gift' end,
         left(btrim(p_title), 120),
         case when p_kind = 'discount' then p_value else null end,
         coalesce(nullif(p_value_kind, ''), 'percent'),
         nullif(btrim(p_description), ''),
         nullif(upper(btrim(p_code)), ''),
         (select auth.uid()),
         p_expires_at
  from public.segment_member_ids(p_segment_id) m;

  get diagnostics n = row_count;
  return n;
end $function$;

REVOKE ALL ON FUNCTION public.grant_reward_to_custom_segment(uuid,text,text,numeric,text,text,text,timestamptz) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.grant_reward_to_custom_segment(uuid,text,text,numeric,text,text,text,timestamptz) TO authenticated;
