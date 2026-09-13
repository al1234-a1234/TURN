-- ════════ التراجع عن حملة هدايا/خصومات ════════
--
-- بيتزا بيل: هديّة الاسترجاع التلقائية الليلية أرسلت ٢٠٨ خصمًا تراكميًّا
-- على ثماني ليالٍ (لا حادثة واحدة) لأن المالك لم يكن يملك طريقةً لمراجعة
-- ما تُرسله الأتمتة أو حملة يدويّة بالغلط والتراجع عمّا لم يُستخدم منها
-- بضغطةٍ واحدة. لا صفّ يحمل اليوم أيّ رابطٍ يجمع «هذي الدفعة نفسها» —
-- فنضيف campaign_id، ونربط كل مصدر جماعي (يدويّ عبر شريحة، أو تلقائيّ
-- عبر الكرون الليلي) بمعرّفٍ واحد لكل استدعاء، ونفتح دالّة تراجعٍ تلمس
-- «النشطة» فقط ولا تمسّ ما صُرف فعلًا — فمن استخدم هديّته بالفعل لا نخذله.

alter table public.customer_rewards add column if not exists campaign_id uuid;

create index if not exists idx_customer_rewards_campaign
  on public.customer_rewards (restaurant_id, campaign_id)
  where campaign_id is not null;

-- ── تعبئة الماضي: كل دفعةٍ سابقة (يدويّة أو تلقائية) أُدرجت بجملة
-- INSERT...SELECT واحدة، وnow() ثابتة طوال الجملة الواحدة في Postgres —
-- فتطابق (restaurant_id, created_at) الدقيق تمييزٌ صحيح ١٠٠٪ للدفعة نفسها،
-- لا تخمين. هديّةٌ فرديّة (منحها الطاقم لعميلٍ واحد يدويًّا) تبقى بلا
-- campaign_id لأنها لا تشارك توقيتها مع صفٍّ آخر.
with groups as (
  select restaurant_id, created_at, gen_random_uuid() as new_campaign_id
  from public.customer_rewards
  where campaign_id is null
  group by restaurant_id, created_at
  having count(*) > 1
)
update public.customer_rewards r
set campaign_id = g.new_campaign_id
from groups g
where r.restaurant_id = g.restaurant_id
  and r.created_at = g.created_at
  and r.campaign_id is null;

-- ── منح شريحة جاهزة: يُرجع الآن معرّف الدفعة مع العدد ──
drop function if exists public.grant_reward_to_segment(uuid, text, text, text, numeric, text, text, text, timestamptz);

create function public.grant_reward_to_segment(
  p_restaurant_id uuid, p_segment text, p_kind text, p_title text,
  p_value numeric, p_value_kind text, p_description text, p_code text,
  p_expires_at timestamptz)
returns table(granted_count integer, campaign_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare n integer; v_branch uuid; v_campaign uuid := gen_random_uuid();
begin
  if not (public.staff_has_perm(p_restaurant_id, 'customers') or public.is_platform_admin()) then
    return query select 0, null::uuid;
    return;
  end if;
  if coalesce(trim(p_title),'') = '' then
    return query select 0, null::uuid;
    return;
  end if;

  v_branch := public.caller_branch_id(p_restaurant_id);

  insert into public.customer_rewards
    (restaurant_id, customer_id, kind, title, value, value_kind, description, code, created_by, expires_at, campaign_id)
  select p_restaurant_id, cr.customer_id,
         case when p_kind='discount' then 'discount' else 'gift' end,
         p_title,
         case when p_kind='discount' then p_value else null end,
         coalesce(nullif(p_value_kind,''),'percent'),
         nullif(trim(p_description),''),
         nullif(upper(trim(p_code)),''),
         (select auth.uid()),
         p_expires_at,
         v_campaign
  from public.customer_restaurant cr
  where cr.restaurant_id = p_restaurant_id
    and cr.is_blocked = false
    and case p_segment
          when 'vip'       then cr.is_vip
          when 'returning' then cr.visits >= 2
          when 'new'       then coalesce(cr.visits, 0) <= 1
          when 'dormant'   then cr.last_visit is not null
                                and cr.last_visit < now() - interval '30 days'
          else true
        end
    and (
      v_branch is null
      or exists (select 1 from public.waitlist_entries w
                 where w.customer_id = cr.customer_id and w.branch_id = v_branch)
      or exists (select 1 from public.reservations r
                 where r.customer_id = cr.customer_id and r.branch_id = v_branch)
    );
  get diagnostics n = row_count;
  return query select n, case when n > 0 then v_campaign else null::uuid end;
end $function$;

revoke all on function public.grant_reward_to_segment(uuid, text, text, text, numeric, text, text, text, timestamptz) from public, anon;
grant execute on function public.grant_reward_to_segment(uuid, text, text, text, numeric, text, text, text, timestamptz) to authenticated;

-- ── منح شريحة مخصّصة: نفس الشيء ──
drop function if exists public.grant_reward_to_custom_segment(uuid, text, text, numeric, text, text, text, timestamptz);

create function public.grant_reward_to_custom_segment(
  p_segment_id uuid, p_kind text, p_title text, p_value numeric,
  p_value_kind text, p_description text, p_code text, p_expires_at timestamptz)
returns table(granted_count integer, campaign_id uuid)
language plpgsql
security definer
set search_path to ''
as $function$
declare n integer; v_rest uuid; v_campaign uuid := gen_random_uuid();
begin
  select restaurant_id into v_rest from public.customer_segments where id = p_segment_id;
  if v_rest is null then
    return query select 0, null::uuid;
    return;
  end if;
  if not (public.staff_has_perm(v_rest, 'customers') or public.is_platform_admin()) then
    return query select 0, null::uuid;
    return;
  end if;
  if coalesce(btrim(p_title), '') = '' then
    return query select 0, null::uuid;
    return;
  end if;

  insert into public.customer_rewards
    (restaurant_id, customer_id, kind, title, value, value_kind, description, code, created_by, expires_at, campaign_id)
  select v_rest, m.customer_id,
         case when p_kind = 'discount' then 'discount' else 'gift' end,
         left(btrim(p_title), 120),
         case when p_kind = 'discount' then p_value else null end,
         coalesce(nullif(p_value_kind, ''), 'percent'),
         nullif(btrim(p_description), ''),
         nullif(upper(btrim(p_code)), ''),
         (select auth.uid()),
         p_expires_at,
         v_campaign
  from public.segment_member_ids(p_segment_id) m;

  get diagnostics n = row_count;
  return query select n, case when n > 0 then v_campaign else null::uuid end;
end $function$;

revoke all on function public.grant_reward_to_custom_segment(uuid, text, text, numeric, text, text, text, timestamptz) from public, anon;
grant execute on function public.grant_reward_to_custom_segment(uuid, text, text, numeric, text, text, text, timestamptz) to authenticated;

-- ── الاسترجاع التلقائي الليلي: دفعة كل ليلة بمعرّفها الخاص ──
create or replace function public.run_auto_winback()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare v_granted int := 0; v_campaign uuid := gen_random_uuid();
begin
  with targets as (
    select cr.restaurant_id, cr.customer_id, ws.title, ws.value, ws.value_kind
    from public.customer_restaurant cr
    join public.winback_settings ws
      on ws.restaurant_id = cr.restaurant_id and ws.is_active
    where cr.is_blocked = false
      and cr.last_visit is not null
      and cr.last_visit < now() - make_interval(days => ws.days_inactive)
      and not exists (
        select 1 from public.customer_rewards r
        where r.restaurant_id = cr.restaurant_id
          and r.customer_id = cr.customer_id
          and r.description = 'هدية استرجاع تلقائية'
          and r.created_at > now() - interval '60 days')
  ),
  ins as (
    insert into public.customer_rewards
      (restaurant_id, customer_id, kind, title, value, value_kind, description, status, expires_at, campaign_id)
    select restaurant_id, customer_id,
           case when value is null then 'gift' else 'discount' end,
           title, value, value_kind,
           'هدية استرجاع تلقائية', 'active', now() + interval '14 days', v_campaign
    from targets
    returning 1
  )
  select count(*) into v_granted from ins;
  return v_granted;
end $function$;

-- ── سجلّ الحملات الأخيرة لمطعم — للمراجعة والتراجع ──
create function public.reward_campaigns_recent(p_restaurant_id uuid, p_limit integer default 30)
returns table(
  campaign_id uuid,
  title text,
  kind text,
  value numeric,
  value_kind text,
  is_auto boolean,
  created_at timestamptz,
  total_count bigint,
  active_count bigint,
  redeemed_count bigint,
  expired_count bigint
)
language sql
stable security definer
set search_path to ''
as $function$
  select
    r.campaign_id,
    min(r.title),
    min(r.kind),
    min(r.value),
    min(r.value_kind),
    bool_and(r.created_by is null),
    min(r.created_at),
    count(*),
    count(*) filter (where r.status = 'active'),
    count(*) filter (where r.status = 'redeemed'),
    count(*) filter (where r.status = 'expired')
  from public.customer_rewards r
  where r.restaurant_id = p_restaurant_id
    and r.campaign_id is not null
    and (public.staff_has_perm(p_restaurant_id, 'customers') or public.is_platform_admin())
  group by r.campaign_id
  order by min(r.created_at) desc
  limit least(coalesce(p_limit, 30), 100);
$function$;

revoke all on function public.reward_campaigns_recent(uuid, integer) from public, anon;
grant execute on function public.reward_campaigns_recent(uuid, integer) to authenticated;

-- ── التراجع: يلمس «النشطة» فقط في هذي الدفعة، ولا يمسّ ما صُرف فعلًا ──
create function public.revoke_campaign_rewards(p_campaign_id uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare v_rest uuid; n integer;
begin
  select restaurant_id into v_rest from public.customer_rewards
    where campaign_id = p_campaign_id limit 1;
  if v_rest is null then return 0; end if;
  if not (public.staff_has_perm(v_rest, 'customers') or public.is_platform_admin()) then
    return 0;
  end if;

  update public.customer_rewards
    set status = 'expired'
    where campaign_id = p_campaign_id
      and status = 'active';
  get diagnostics n = row_count;
  return n;
end $function$;

revoke all on function public.revoke_campaign_rewards(uuid) from public, anon;
grant execute on function public.revoke_campaign_rewards(uuid) to authenticated;
