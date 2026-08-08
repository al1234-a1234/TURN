-- ═══════════════════════════════════════════════════════════════════
--  «دوري وحجزي يضيعان إذا سكّرت المتصفّح» — وهو صحيح.
--
--  الاسترجاع كان يعتمد على التخزين المحلّي وحده (lastTurnFor)، وهو هشّ:
--  يضيع بمتصفّحٍ آخر، أو تصفّحٍ خفيّ، أو تثبيت التطبيق (سياق تخزينٍ جديد)،
--  أو مسح البيانات، أو تبديل الجهاز. والحجز أسوأ: لم يكن يُحفظ أصلًا، ولا
--  توجد دالّة تُرجعه ولا تُلغيه — بابٌ باتجاه واحد.
--
--  والهويّة الحقيقية للعميل رقمُه لا جهازُه. فالاسترجاع من الخادم بالرقم،
--  والتخزين المحلّي يبقى مسارًا سريعًا لا مصدرًا وحيدًا.
--
--  وضرره على المطعم كضرره على العميل: من حجز ولم يستطع الإلغاء تبقى
--  طاولته محجوزة، فيخسرها المطعم ويُسجَّل «لم يحضر» — والرقم الذي يبيعه
--  صاحب المطعم هو هذا بعينه.
--
--  (طُبِّق على الإنتاج باسم 0083_guest_recovery_by_phone.)
-- ═══════════════════════════════════════════════════════════════════

-- ── استرجاع كل ما هو حيٌّ للعميل: دورٌ قائم أو حجزٌ قادم ──
create or replace function public.guest_status_by_phone(p_phone text)
returns table (
  kind text,               -- 'turn' | 'reservation'
  id uuid,
  restaurant text,
  restaurant_slug text,
  branch_id uuid,
  branch text,
  status text,
  at timestamptz,          -- وقت الانضمام أو موعد الحجز
  party_size int,
  zone_name text,
  "position" int,          -- للدور فقط
  table_label text,        -- للحجز فقط
  full_name text
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare v_p text;
begin
  v_p := public.norm_phone_input(p_phone);
  if length(v_p) <> 9 then return; end if;
  -- نفس حارس rewards_by_phone: يمنع تعداد الأرقام بالتخمين
  if not public.check_rate('gstat:p:' || v_p, 60, interval '1 hour') then return; end if;

  return query
  -- الأدوار الحيّة
  select 'turn'::text, w.id, r.name, r.slug, b.id, b.name, w.status::text,
         w.joined_at, w.party_size,
         coalesce(z.name, w.zone), w."position", null::text, c.full_name
  from public.waitlist_entries w
  join public.customers   c on c.id = w.customer_id
  join public.branches    b on b.id = w.branch_id
  join public.restaurants r on r.id = b.restaurant_id
  left join public.branch_zones z on z.branch_id = w.branch_id and z.key = w.zone
  where right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 9) = v_p
    and w.status in ('waiting','notified')

  union all

  -- الحجوزات القادمة (وساعةٌ مضت: من تأخّر قليلًا ما زال حجزه قائمًا)
  select 'reservation'::text, rs.id, r.name, r.slug, b.id, b.name, rs.status::text,
         rs.reserved_at, rs.party_size,
         coalesce(z.name, t.zone), null::int, t.label, c.full_name
  from public.reservations rs
  join public.customers   c on c.id = rs.customer_id
  join public.branches    b on b.id = rs.branch_id
  join public.restaurants r on r.id = b.restaurant_id
  left join public.tables t on t.id = rs.table_id
  left join public.branch_zones z on z.branch_id = rs.branch_id and z.key = t.zone
  where right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 9) = v_p
    and rs.status in ('pending','confirmed')
    and rs.reserved_at > now() - interval '1 hour'

  order by 8;  -- at
end $function$;

revoke all on function public.guest_status_by_phone(text) from public;
grant execute on function public.guest_status_by_phone(text) to anon, authenticated;


-- ── إلغاء الحجز من العميل نفسه ──
create or replace function public.cancel_reservation_guest(p_id uuid, p_phone text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare v_p text; v_ok boolean;
begin
  v_p := public.norm_phone_input(p_phone);
  if p_id is null or length(v_p) <> 9 then return false; end if;
  if not public.check_rate('rescancel:p:' || v_p, 30, interval '1 hour') then return false; end if;

  -- الرقم شرطٌ لا زينة: بدونه يُلغي أيّ أحدٍ حجزَ أيّ أحد بمعرفة المعرّف وحده.
  update public.reservations rs
     set status = 'cancelled'
    from public.customers c
   where rs.id = p_id
     and c.id = rs.customer_id
     and right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 9) = v_p
     and rs.status in ('pending','confirmed');

  get diagnostics v_ok = row_count;
  return v_ok;
end $function$;

revoke all on function public.cancel_reservation_guest(uuid, text) from public;
grant execute on function public.cancel_reservation_guest(uuid, text) to anon, authenticated;
