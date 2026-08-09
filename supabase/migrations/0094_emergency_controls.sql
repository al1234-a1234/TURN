-- مقودُ الطوارئ — لأنّك لن تكون أمام الشاشة ليلة الجمعة.
--
-- اليوم إن ساءت الأمور — هجوم، أو عطبٌ يكتب بياناتٍ خاطئة، أو فرعٌ امتلأ
-- طابوره بصفوفٍ وهميّة — فخيارك الوحيد فتحُ المحرّر ونشرُ تعديل. وذلك
-- يصلح لمطعمٍ واحد، ولا يصلح لخمسةٍ وعشرين، ولا يصلح وأنت نائم.
--
-- وهذا الترحيل خاملٌ تمامًا حتى يُستعمل: المفتاح مطفأ، والمطاعم فعّالة،
-- فلا يتغيّر سلوكٌ واحد بتطبيقه. ولذلك يُطبَّق على الإنتاج فورًا بلا
-- انتظار نشرٍ — بخلاف 0093.

-- ════ (١) حالة المنصّة — صفٌّ واحدٌ لا غير ════
create table if not exists public.platform_status (
  only_row boolean primary key default true check (only_row),
  paused   boolean not null default false,
  reason   text,
  since    timestamptz,
  by_user  uuid
);
insert into public.platform_status (only_row, paused) values (true, false)
  on conflict (only_row) do nothing;

alter table public.platform_status enable row level security;

-- الجميع يقرأ: الواجهة تحتاجها لتعرض بطاقة صيانةٍ مهذّبة بدل رسالة خطأ.
-- والفرق بينهما هو الفرق بين «تحت الصيانة» و«التطبيق خربان».
drop policy if exists "anyone reads platform status" on public.platform_status;
create policy "anyone reads platform status" on public.platform_status
  for select using (true);

drop policy if exists "platform admin writes status" on public.platform_status;
create policy "platform admin writes status" on public.platform_status
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

grant select on public.platform_status to anon, authenticated;
revoke insert, update, delete on public.platform_status from public, anon;

-- ════ (٢) سجلّ التدقيق — لا يُعدَّل ولا يُحذف ════
--
-- كلّ فعلٍ إداريّ يترك أثرًا. ليس لأنّنا نشكّ في أحد، بل لأنّ مطعمًا
-- سيقول يومًا «طابوري ضاع» أو «مَن أوقف فرعي؟» — وحينها إمّا أن تُثبت
-- أو أن تعتذر. وبناء هذا بعد الخلاف مستحيل: الأثر لا يُستعاد بأثرٍ رجعيّ.
create table if not exists public.admin_audit (
  id            uuid primary key default gen_random_uuid(),
  at            timestamptz not null default now(),
  actor         uuid,
  action        text not null,
  restaurant_id uuid,
  branch_id     uuid,
  reason        text,
  detail        jsonb not null default '{}'::jsonb
);

create index if not exists idx_admin_audit_at   on public.admin_audit (at desc);
create index if not exists idx_admin_audit_rest on public.admin_audit (restaurant_id, at desc);

alter table public.admin_audit enable row level security;

drop policy if exists "platform admin reads audit" on public.admin_audit;
create policy "platform admin reads audit" on public.admin_audit
  for select to authenticated using (public.is_platform_admin());

-- ومالك العلامة يرى ما جرى على مطعمه هو: السجلّ الذي لا يراه صاحب الحقّ
-- يحمي المنصّة منه، لا يحميه.
drop policy if exists "manager reads own audit" on public.admin_audit;
create policy "manager reads own audit" on public.admin_audit
  for select to authenticated using (public.is_brand_manager(restaurant_id));

-- لا سياسة كتابةٍ البتّة: لا يُكتب فيه إلا من داخل دوالّ SECURITY DEFINER
revoke insert, update, delete on public.admin_audit from public, anon, authenticated;
grant  select on public.admin_audit to authenticated;

-- والحصانة الحقيقيّة مُطلِقٌ لا صلاحية: الصلاحيات تُمنح سهوًا في ترحيلٍ
-- لاحق، و`service_role` يتجاوز RLS أصلًا. أمّا هذا فيرفض التعديل والحذف
-- من كلّ دورٍ مهما علا. سجلٌّ يمكن تحريره ليس سجلًّا.
create or replace function public.admin_audit_immutable()
returns trigger language plpgsql as $function$
begin
  raise exception 'سجلّ التدقيق لا يُعدَّل ولا يُحذف' using errcode = 'P0433';
end $function$;

drop trigger if exists trg_admin_audit_immutable on public.admin_audit;
create trigger trg_admin_audit_immutable
  before update or delete on public.admin_audit
  for each row execute function public.admin_audit_immutable();

drop trigger if exists trg_admin_audit_no_truncate on public.admin_audit;
create trigger trg_admin_audit_no_truncate
  before truncate on public.admin_audit
  for each statement execute function public.admin_audit_immutable();

-- ════ (٣) الحارس: المنصّة مفتوحة، والمطعم يعمل ════
--
-- ويُصلح معه عطبًا قائمًا: `join_waitlist_guest` تفحص `branches.is_active`
-- ولا تفحص `restaurants.is_active`. فإيقاف مطعمٍ كاملٍ اليوم يُخفيه من
-- الدليل ولا يمنع الانضمام عبر رمز QR مباشر — إيقافٌ بالاسم لا بالفعل.
-- والحارس مُطلِقٌ لا تعديلٌ في الدالّة: إضافةٌ فوق مسارٍ ساخنٍ مُجرَّب
-- أأمن من إعادة كتابته، وتشمل كلّ طرق الإدخال لا طريقًا واحدًا.
create or replace function public.enforce_platform_open()
returns trigger language plpgsql security definer set search_path to '' as $function$
declare v_paused boolean; v_reason text; v_rest_active boolean;
begin
  select s.paused, s.reason into v_paused, v_reason
    from public.platform_status s where s.only_row;

  if v_paused then
    raise exception 'المنصّة تحت الصيانة%',
      case when coalesce(v_reason, '') = '' then '' else ' — ' || v_reason end
      using errcode = 'P0432';
  end if;

  select r.is_active into v_rest_active
    from public.branches b
    join public.restaurants r on r.id = b.restaurant_id
   where b.id = new.branch_id;

  -- ‏P0002 عمدًا: الواجهة تترجمه أصلًا إلى «هذا الفرع لم يعد متاحًا»،
  -- فلا نُدخل رسالةً جديدة على العميل من أجل تمييزٍ يخصّنا نحن.
  if v_rest_active is distinct from true then
    raise exception 'المطعم متوقّف حاليًا' using errcode = 'P0002';
  end if;

  return new;
end $function$;

drop trigger if exists trg_platform_open_waitlist on public.waitlist_entries;
create trigger trg_platform_open_waitlist before insert on public.waitlist_entries
  for each row execute function public.enforce_platform_open();

drop trigger if exists trg_platform_open_reservations on public.reservations;
create trigger trg_platform_open_reservations before insert on public.reservations
  for each row execute function public.enforce_platform_open();

-- ‏BEFORE INSERT وحدها عمدًا: الإيقاف يمنع الدخول الجديد ولا يمنع
-- التصريف. من كان في الطابور يُجلَس ويُلغى ويُنبَّه كالمعتاد — وإلّا
-- حبسنا مئةً واقفين على الأبواب بحجّة حمايتهم.

-- ════ (٤) الروافع ════

-- مفتاح المنصّة كلّها
create or replace function public.set_platform_pause(p_paused boolean, p_reason text default null)
returns boolean language plpgsql security definer set search_path to '' as $function$
declare v_uid uuid := auth.uid();
begin
  if not public.is_platform_admin() then
    raise exception 'غير مصرّح' using errcode = '42501';
  end if;

  update public.platform_status
     set paused  = coalesce(p_paused, false),
         reason  = nullif(btrim(coalesce(p_reason, '')), ''),
         since   = case when p_paused then now() else null end,
         by_user = v_uid
   where only_row;

  insert into public.admin_audit (actor, action, reason, detail)
    values (v_uid,
            case when p_paused then 'platform.pause' else 'platform.resume' end,
            nullif(btrim(coalesce(p_reason, '')), ''),
            jsonb_build_object('paused', p_paused));

  return true;
end $function$;

-- إيقاف مطعمٍ واحد — لمدير المنصّة أو لمالك العلامة نفسه
create or replace function public.set_restaurant_pause(
  p_restaurant_id uuid, p_paused boolean, p_reason text default null)
returns boolean language plpgsql security definer set search_path to '' as $function$
declare v_uid uuid := auth.uid();
begin
  if not (public.is_platform_admin() or public.is_brand_manager(p_restaurant_id)) then
    raise exception 'غير مصرّح' using errcode = '42501';
  end if;

  update public.restaurants set is_active = not coalesce(p_paused, false)
   where id = p_restaurant_id;
  if not found then
    raise exception 'مطعم غير موجود' using errcode = 'P0002';
  end if;

  insert into public.admin_audit (actor, action, restaurant_id, reason, detail)
    values (v_uid,
            case when p_paused then 'restaurant.pause' else 'restaurant.resume' end,
            p_restaurant_id,
            nullif(btrim(coalesce(p_reason, '')), ''),
            jsonb_build_object('paused', p_paused));

  return true;
end $function$;

-- تفريغ طابور فرعٍ واحد — بسببٍ مكتوب، وعددٍ محفوظ
--
-- الحاجة إليه واقعيّة: صفوفٌ وهميّة من هجوم، أو طابورٌ عَلِق بعد عطلٍ في
-- الشبكة، أو مضيفٌ جديد أدخل عشرين صفًّا خطأً. وبديله اليوم أن يضغط
-- «أُجلِس» عشرين مرّة — أو أن تفتح أنت المحرّر.
create or replace function public.staff_clear_branch_queue(p_branch_id uuid, p_reason text)
returns integer language plpgsql security definer set search_path to '' as $function$
declare v_uid uuid := auth.uid(); v_rest uuid; v_n int; v_reason text;
begin
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  -- السبب إلزاميّ: فعلٌ يمحو طابور فرعٍ كاملًا يجب أن يُفسَّر وقت وقوعه،
  -- لا أن يُستنتج بعد شهرٍ من الذاكرة.
  if v_reason is null then
    raise exception 'السبب مطلوب' using errcode = '22023';
  end if;

  v_rest := public.restaurant_of_branch(p_branch_id);
  if v_rest is null then
    raise exception 'فرع غير موجود' using errcode = 'P0002';
  end if;
  if not (public.is_platform_admin() or public.is_manager_of(v_rest)) then
    raise exception 'غير مصرّح' using errcode = '42501';
  end if;

  update public.waitlist_entries
     set status = 'expired'
   where branch_id = p_branch_id
     and status in ('waiting', 'notified');
  get diagnostics v_n = row_count;

  insert into public.admin_audit (actor, action, restaurant_id, branch_id, reason, detail)
    values (v_uid, 'queue.clear', v_rest, p_branch_id, v_reason,
            jsonb_build_object('cleared', v_n));

  return v_n;
end $function$;

-- ════ (٥) من يملك أن يسحب الرافعة ════
revoke execute on function public.set_platform_pause(boolean, text)          from public, anon;
grant  execute on function public.set_platform_pause(boolean, text)          to authenticated, service_role;
revoke execute on function public.set_restaurant_pause(uuid, boolean, text)  from public, anon;
grant  execute on function public.set_restaurant_pause(uuid, boolean, text)  to authenticated, service_role;
revoke execute on function public.staff_clear_branch_queue(uuid, text)       from public, anon;
grant  execute on function public.staff_clear_branch_queue(uuid, text)       to authenticated, service_role;
revoke execute on function public.enforce_platform_open()                    from public, anon, authenticated;
revoke execute on function public.admin_audit_immutable()                    from public, anon, authenticated;
