-- الاستعلام بالرقم كان يُعطي المهاجم جائزته كاملة.
--
-- الدليل الذي أوقف كل شيء: برقم جوّالٍ وحده، من الإنترنت المفتوح وبلا
-- حساب، كان يخرج **الاسم الكامل** لصاحب الرقم + المطعم + الفرع + الحالة
-- + وقت الانضمام + عدد المرافقين + القسم + الترتيب. جرّبتُه على ضحيّةٍ
-- وهميّة داخل معاملةٍ مُلغاة فخرج: «نورة الشمري · Eficto · الفرع الرئيسي
-- · waiting · ٣ أشخاص». ومعرفة أنّ شخصًا بعينه في مطعمٍ بعينه الآن ليست
-- مسألة خصوصيّةٍ فحسب — بل أمانٌ شخصيّ.
--
-- والحدّ الذي ظنناه حارسًا لم يكن يحرس: مفتاحه `gstat:p:<الرقم>` — أي على
-- **المطلوب** لا الطالب. فثلاثة نداءاتٍ بثلاثة أرقام تُنشئ ثلاثة دلاءٍ
-- منفصلة، كلٌّ بميزانيّةٍ كاملة. يمنع القرع على رقمٍ بعينه، ولا يمنع
-- المرور على الأرقام رقمًا بعد رقم — وهو الهجوم بعينه.
--
-- المبدأ الحاكم: **العميل واقفٌ في المطعم** — لا يحتاج النظام أن يخبره
-- أين هو، يحتاج «كم بقي على دوري». أمّا المهاجم فالموقعُ كلُّ جائزته.
-- فنُبقي الميزة ونحذف الجائزة.
--
-- ولم نشترط معرّف التذكرة: من فقد تذكرته لا يملك المعرّف، والاسترجاع
-- بالرقم وُجد له بالذات (0084). اشتراطه يقتل الميزة لا يحميها.
--
-- بندٌ يبقى مفتوحًا ولا يُعدّ مغلقًا: يظلّ للمهاجم أن يعرف أنّ رقمًا
-- بعينه في طابورٍ ما الآن. لا يُزال إلّا بإثبات الحيازة (رمزٌ لمرّةٍ
-- واحدةٍ برسالة)، وهو مؤجَّلٌ لما بعد الإطلاق بقرار المالك.

-- ملحٌ لكل بيئة، يُولَّد هنا ولا يُكتب في المستودع (المستودع عامّ).
-- بدونه يصير سجلّ الاستعلامات قاموسًا: تجزئةُ رقمٍ بلا ملحٍ تُكسر بجدول
-- أرقامٍ جاهز في ثوانٍ.
create table if not exists public.app_salt (
  id   boolean primary key default true check (id),
  salt text not null default encode(extensions.gen_random_bytes(32), 'hex')
);
insert into public.app_salt (id) values (true) on conflict (id) do nothing;
alter table public.app_salt enable row level security;
revoke all on public.app_salt from public, anon, authenticated;

-- سجلّ الاستعلامات: بصماتٌ مُملَّحة لا أرقامًا ولا عناوين.
-- سجلٌّ يجمع أرقام الناس يصير هو الثغرة. و`unlogged` لأنّه قياسٌ لا دفتر
-- حسابات — لا يستحقّ WAL ولا استعادةً نقطيّة.
create unlogged table if not exists public.phone_lookup_log (
  id           bigserial primary key,
  at           timestamptz not null default now(),
  endpoint     text        not null,
  phone_hash   text        not null,
  ip_hash      text,
  -- ‏-1 = رُفض بالحدّ. صفر = رقمٌ لا شيء عليه. وهما مختلفان في التحليل:
  -- سيلٌ من الأصفار من طالبٍ واحد هو التعداد بعينه.
  result_count integer     not null default 0
);
alter table public.phone_lookup_log enable row level security;
revoke all on public.phone_lookup_log from public, anon, authenticated;
create index if not exists idx_phone_lookup_log_at on public.phone_lookup_log (at desc);
create index if not exists idx_phone_lookup_log_ip on public.phone_lookup_log (ip_hash, at desc);

-- التقاعد: ثلاثون يومًا تكفي للتحليل، وما بعدها عبءٌ ومسؤوليّة.
create or replace function public.retire_phone_lookup_log()
returns integer
language sql
security definer
set search_path = ''
as $$
  with gone as (delete from public.phone_lookup_log where at < now() - interval '30 days' returning 1)
  select count(*)::int from gone;
$$;
revoke all on function public.retire_phone_lookup_log() from public, anon, authenticated;

-- ــــــ الحدّ المركّب ــــــ
-- ثلاثة عدّادات، ويكفي فشل واحدٍ للرفض:
--   ١) على الرقم    — يمنع القرع على رقمٍ بعينه (كما كان)
--   ٢) على الطالب   — يمنع الرشقات
--   ٣) سقف الأرقام المختلفة لكل طالبٍ في اليوم — **هذا وحده هو الذي يقتل
--      التعداد**؛ الاثنان قبله لا يكفيان.
-- والحيلة في الثالث: `check_rate(key,1,'1 day')` ترجع true أوّل مرّةٍ فقط،
-- فهي كاشفةُ «رقمٌ جديدٌ لهذا الطالب» — وعندها وحدها يُزاد عدّاد الأرقام.
create or replace function public.guest_status_by_phone(p_phone text, p_ip text)
returns table (
  kind        text,
  status      text,
  at          timestamptz,
  party_size  integer,
  "position"  integer
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_p text; v_ip text; v_salt text; v_ok boolean; v_n integer := 0;
begin
  v_p := public.norm_phone_input(p_phone);
  if length(v_p) <> 9 then return; end if;

  -- عنوانٌ غائب = طالبٌ مجهولٌ واحدٌ مشترك (الأشدّ)، لا طالبٌ جديد لكل طلب
  v_ip := coalesce(nullif(btrim(p_ip), ''), 'unknown');
  select s.salt into v_salt from public.app_salt s limit 1;

  v_ok := public.check_rate('gstat:p:'  || v_p,  60,  interval '1 hour');
  if v_ok then
    v_ok := public.check_rate('gstat:ip:' || v_ip, 120, interval '1 hour');
  end if;
  if v_ok and public.check_rate('gstat:ipn:' || v_ip || ':' || v_p, 1, interval '1 day') then
    v_ok := public.check_rate('gstat:ipd:' || v_ip, 20, interval '1 day');
  end if;

  if not v_ok then
    insert into public.phone_lookup_log (endpoint, phone_hash, ip_hash, result_count)
    values ('my-status',
            encode(extensions.digest(v_salt || v_p,  'sha256'), 'hex'),
            encode(extensions.digest(v_salt || v_ip, 'sha256'), 'hex'), -1);
    return;
  end if;

  return query
  -- الأدوار الحيّة
  select 'turn'::text, w.status::text, w.joined_at, w.party_size, w."position"
  from public.waitlist_entries w
  join public.customers c on c.id = w.customer_id
  where right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 9) = v_p
    and w.status in ('waiting','notified')
  union all
  -- والحجوزات القادمة (وساعةٌ مضت: من تأخّر قليلًا ما زال حجزه قائمًا)
  select 'reservation'::text, rs.status::text, rs.reserved_at, rs.party_size, null::int
  from public.reservations rs
  join public.customers c on c.id = rs.customer_id
  where right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 9) = v_p
    and rs.status in ('pending','confirmed')
    and rs.reserved_at > now() - interval '1 hour'
  order by 3;

  get diagnostics v_n = row_count;
  insert into public.phone_lookup_log (endpoint, phone_hash, ip_hash, result_count)
  values ('my-status',
          encode(extensions.digest(v_salt || v_p,  'sha256'), 'hex'),
          encode(extensions.digest(v_salt || v_ip, 'sha256'), 'hex'), v_n);
end
$fn$;

-- التوقيع القديم يبقى — لكن محصَّنًا، ويُعامَل كطالبٍ مجهول.
-- إبقاؤه ليس تساهلًا: النشر على مرحلتين، ولو اختفى لانكسر المسار المنشور
-- بين الترحيل ونشر الكود الذي يمرّر العنوان — وهو ما كسر الإنتاج مرّتين.
create or replace function public.guest_status_by_phone(p_phone text)
returns table (
  kind        text,
  status      text,
  at          timestamptz,
  party_size  integer,
  "position"  integer
)
language sql
security definer
set search_path = ''
as $$ select * from public.guest_status_by_phone(p_phone, null); $$;

-- والهدايا بالمثل: تُحذف هويّة المطعم لأنّها تكشف أين يأكل الشخص عادةً
create or replace function public.rewards_by_phone(p_phone text, p_ip text)
returns table (
  id          uuid,
  kind        text,
  title       text,
  value       numeric,
  value_kind  text,
  description text,
  status      text,
  armed_at    timestamptz,
  expires_at  timestamptz,
  redeemed_at timestamptz,
  created_at  timestamptz
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_p text; v_ip text; v_salt text; v_ok boolean; v_n integer := 0;
begin
  v_p := public.norm_phone_input(p_phone);
  if length(v_p) <> 9 then return; end if;
  v_ip := coalesce(nullif(btrim(p_ip), ''), 'unknown');
  select s.salt into v_salt from public.app_salt s limit 1;

  v_ok := public.check_rate('rewards:p:'  || v_p,  60,  interval '1 hour');
  if v_ok then
    v_ok := public.check_rate('rewards:ip:' || v_ip, 120, interval '1 hour');
  end if;
  if v_ok and public.check_rate('rewards:ipn:' || v_ip || ':' || v_p, 1, interval '1 day') then
    v_ok := public.check_rate('rewards:ipd:' || v_ip, 20, interval '1 day');
  end if;

  if not v_ok then
    insert into public.phone_lookup_log (endpoint, phone_hash, ip_hash, result_count)
    values ('my-rewards',
            encode(extensions.digest(v_salt || v_p,  'sha256'), 'hex'),
            encode(extensions.digest(v_salt || v_ip, 'sha256'), 'hex'), -1);
    return;
  end if;

  return query
  select cr.id, cr.kind, cr.title, cr.value, cr.value_kind, cr.description,
         cr.status, cr.armed_at, cr.expires_at, cr.redeemed_at, cr.created_at
  from public.customer_rewards cr
  join public.customers c on c.id = cr.customer_id
  where right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 9) = v_p
    and cr.status in ('active','redeemed')
    and (cr.status = 'redeemed' or cr.expires_at is null or cr.expires_at > now())
  order by (cr.status = 'active') desc, cr.armed_at desc nulls last, cr.created_at desc;

  get diagnostics v_n = row_count;
  insert into public.phone_lookup_log (endpoint, phone_hash, ip_hash, result_count)
  values ('my-rewards',
          encode(extensions.digest(v_salt || v_p,  'sha256'), 'hex'),
          encode(extensions.digest(v_salt || v_ip, 'sha256'), 'hex'), v_n);
end
$fn$;

create or replace function public.rewards_by_phone(p_phone text)
returns table (
  id          uuid,
  kind        text,
  title       text,
  value       numeric,
  value_kind  text,
  description text,
  status      text,
  armed_at    timestamptz,
  expires_at  timestamptz,
  redeemed_at timestamptz,
  created_at  timestamptz
)
language sql
security definer
set search_path = ''
as $$ select * from public.rewards_by_phone(p_phone, null); $$;

-- كلّها من خادمنا وحده (0093): لا الزائر ولا المسجَّل ينادي شيئًا من هذا
revoke all on function public.guest_status_by_phone(text)       from public, anon, authenticated;
revoke all on function public.guest_status_by_phone(text, text) from public, anon, authenticated;
revoke all on function public.rewards_by_phone(text)            from public, anon, authenticated;
revoke all on function public.rewards_by_phone(text, text)      from public, anon, authenticated;
grant execute on function public.guest_status_by_phone(text)       to service_role;
grant execute on function public.guest_status_by_phone(text, text) to service_role;
grant execute on function public.rewards_by_phone(text)            to service_role;
grant execute on function public.rewards_by_phone(text, text)      to service_role;
