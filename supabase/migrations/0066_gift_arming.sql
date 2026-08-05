-- 0066 — «استعمال الهدية»: الهدية لا تلاحق العميل، هو الذي يسلّحها.
--
-- كانت الهدايا تُعرَض لمن كتب الرقم، وتُلاحق العميل بكتلة في صفحة كل مطعم
-- وهو جاء ليأخذ دوره. صارت: العميل يفتح «الهدايا» من قائمة حسابه، يضغط
-- «استعمال» على هدية، فتُسلَّح لذلك المطعم وحده — ثم تظهر مع دوره
-- وللاستقبال، ويعتمدها الموظّف عند التسليم.
--
-- ضغطة «استعمال» لا تصرف الهدية: لو ما جاء العميل أو غيّر رأيه يفكّها
-- وترجع له كما كانت. الصرف يبقى بيد الموظّف وحده.
--
-- إضافة فقط: لا إسقاط جدول ولا عمود ولا دالة. آمنة على الإنتاج الحيّ.

-- ═══ ١) علامة التسليح ═══
alter table public.customer_rewards
  add column if not exists armed_at timestamptz;

comment on column public.customer_rewards.armed_at is
  'لحظة ضغط العميل «استعمال». مسلّحة = armed_at is not null و status=active. تُفرَّغ عند الفكّ وعند الصرف.';

-- فهرس الاستقبال: «هل لعميل في هذا الطابور هدية مسلّحة؟»
create index if not exists idx_customer_rewards_armed
  on public.customer_rewards (restaurant_id, customer_id)
  where status = 'active' and armed_at is not null;

-- ═══ ٢) هدايا صاحب الحساب — بحسابه لا برقمه ═══
-- get_customer_rewards(p_phone) تبقى كما هي لمسارات أخرى، لكن العرض في
-- التطبيق صار عبر هذه: مربوطة بـ auth.uid() فلا ينتحل أحد هدايا غيره
-- بتجريب أرقام.
create or replace function public.my_rewards()
returns table (
  id uuid,
  restaurant text,
  restaurant_slug text,
  kind text,
  title text,
  value numeric,
  value_kind text,
  description text,
  status text,
  armed_at timestamptz,
  expires_at timestamptz,
  redeemed_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path to ''
stable
as $function$
begin
  return query
  select cr.id, r.name, r.slug, cr.kind, cr.title, cr.value, cr.value_kind,
         cr.description, cr.status, cr.armed_at, cr.expires_at, cr.redeemed_at, cr.created_at
  from public.customer_rewards cr
  join public.customers   c on c.id = cr.customer_id
  join public.restaurants r on r.id = cr.restaurant_id
  where c.user_id = (select auth.uid())
    and cr.status in ('active','redeemed')
    and (cr.status = 'redeemed' or cr.expires_at is null or cr.expires_at > now())
  order by (cr.status = 'active') desc,
           cr.armed_at desc nulls last,
           cr.created_at desc;
end $function$;

revoke all on function public.my_rewards() from public, anon;
grant execute on function public.my_rewards() to authenticated;

-- ═══ ٣) تسليح الهدية وفكّها ═══
-- p_arm=true يسلّح، false يفكّ. الملكية تُتحقَّق داخل الدالة: لا يسلّح
-- أحد هدية غيره ولو عرف معرّفها.
create or replace function public.set_reward_armed(p_reward_id uuid, p_arm boolean)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare n int;
begin
  if p_reward_id is null then return false; end if;

  update public.customer_rewards cr
     set armed_at = case when p_arm then now() else null end
    from public.customers c
   where cr.id = p_reward_id
     and c.id = cr.customer_id
     and c.user_id = (select auth.uid())
     and cr.status = 'active'
     and (cr.expires_at is null or cr.expires_at > now());

  get diagnostics n = row_count;
  return n > 0;
end $function$;

revoke all on function public.set_reward_armed(uuid, boolean) from public, anon;
grant execute on function public.set_reward_armed(uuid, boolean) to authenticated;

-- ═══ ٤) الصرف يفكّ التسليح ═══
-- نصّها الأصلي كما هو (is_staff_of + فحص الانتهاء)، وأُضيف سطر واحد:
-- تفريغ armed_at حتى لا تبقى علامة تسليح معلّقة على هدية مصروفة.
create or replace function public.staff_redeem_reward(p_reward_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare n int;
begin
  update public.customer_rewards cr
     set status = 'redeemed', redeemed_at = now(), armed_at = null
   where cr.id = p_reward_id
     and cr.status = 'active'
     and (cr.expires_at is null or cr.expires_at > now())
     and public.is_staff_of(cr.restaurant_id);
  get diagnostics n = row_count;
  return n > 0;
end $function$;
