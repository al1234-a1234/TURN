-- مستأجرٌ صناعيّ للنبض — «هل نجح إنسانٌ في أخذ دوره؟»
--
-- فحوصنا اليوميّة كلّها تقيس صحّة القاعدة: صلاحيات، فهارس، كرونات،
-- عزل. وحارس الحياة يقيس أنّ الرئيسية ترجع ٢٠٠ وأنّ القاعدة تنبض.
-- ولا واحد منها يقيس ما يهمّ العميل فعلًا: أنّه ضغط «خذ دورك» فحصل
-- على دور. وبينهما مسافةٌ كاملة — نشرةٌ مكسورة، أو مفتاح خدمةٍ سقط،
-- أو حدُّ عنوانٍ اختلّ: كلّها تُبقي الرئيسية ٢٠٠ والقاعدة نابضة،
-- ويعجز العميل عن أخذ دوره.
--
-- والنبض يحتاج مكانًا يمرّ منه بلا أن يُزعج أحدًا: صفٌّ وهميّ كلّ ربع
-- ساعة في طابور مطعمٍ حقيقيّ يجعل المضيف يرى أشباحًا. فمستأجرٌ صناعيّ
-- كامل — مطعمٌ وفرعٌ حقيقيّان في الإنتاج — يُعلَّم بـ`is_canary` فيُستثنى
-- من الدليل والبحث والصفحات المولَّدة، ويبقى فعّالًا فيمرّ منه الحارس
-- الجديد (0094) الذي يمنع الانضمام إلى مطعمٍ متوقّف.
--
-- وساعاته فارغة عمدًا: `branch_open_by_hours(null)` تُرجع true، فالنبض
-- يعمل الثالثة فجرًا كما يعمل التاسعة مساءً. فحصٌ ينام نصف اليوم ليس فحصًا.

alter table public.restaurants
  add column if not exists is_canary boolean not null default false;

create index if not exists idx_restaurants_canary on public.restaurants (is_canary) where is_canary;

-- العمود يُضاف بعد 0092، فيحتاج منحًا صريحًا: القائمة هناك بيضاء لا سوداء،
-- وكلّ عمودٍ جديد محجوبٌ حتى يُذكر. (وهذا هو المقصود — لكنّه يعني أنّ
-- إضافة عمودٍ عامٍّ لاحقًا تحتاج سطر منحٍ معه، وإلّا انكسرت الواجهة صامتة.)
grant select (is_canary) on public.restaurants to anon, authenticated;

do $$
declare v_owner uuid; v_rest uuid; v_branch uuid;
begin
  select r.id into v_rest from public.restaurants r where r.slug = 'canary-probe';
  if v_rest is not null then return; end if;

  select pa.user_id into v_owner from public.platform_admins pa limit 1;
  if v_owner is null then
    raise exception 'لا يوجد مدير منصّة يملك مطعم الكناري';
  end if;

  insert into public.restaurants (owner_id, name, name_en, slug, is_active, is_canary)
    values (v_owner, 'نبض دور', 'Dour canary', 'canary-probe', true, true)
    returning id into v_rest;

  insert into public.branches (restaurant_id, name, name_en, city, is_active)
    values (v_rest, 'فرع النبض', 'Canary branch', 'canary', true)
    returning id into v_branch;

  update public.branch_settings
     set accepts_waitlist = true,
         accepts_reservations = false,
         manually_closed = false,
         opening_hours = null,
         max_party_size = 4
   where branch_id = v_branch;

  insert into public.admin_audit (actor, action, restaurant_id, branch_id, reason, detail)
    values (v_owner, 'canary.provision', v_rest, v_branch,
            'مستأجرٌ صناعيّ للنبض الدوريّ', jsonb_build_object('slug', 'canary-probe'));
end $$;
