# STATUS.md — تقرير جرد مشروع «دور / Turn»

> تقرير جرد للقراءة فقط. أُنشئ هذا الملف فقط ولم يُعدَّل أي ملف آخر.
> التاريخ: 2026-07-25 · المشروع: `/home/user/turn` · Supabase ref: `nkdfxmjuigslmangzuua` (eu-central-1).
> مصادر الحقائق: قراءة الكود مباشرة + استعلام قاعدة الإنتاج الحيّة (RLS/الفهارس/الدوال/cron) عبر Supabase.

---

## 1. التقنيات

المصدر: `package.json` (قُرئ كاملًا). **مدير الحزم: npm** — يوجد `package-lock.json` فقط (لا pnpm/yarn).

**الإطار واللغة:**
- **Next.js** `^15.5.20` (App Router) — `package.json:14`
- **React / React-DOM** `19.2.4` (مثبّت بدون `^`) — `package.json:16-17`
- **TypeScript** `^5` — `package.json:28`
- **Tailwind CSS** `v4` (`tailwindcss ^4` + `@tailwindcss/postcss ^4`) بلا `tailwind.config`؛ الإعداد عبر CSS في `src/app/globals.css`

**الاعتمادات الأساسية (`dependencies`, `package.json:11-18`):**
| الحزمة | الإصدار |
|---|---|
| `@supabase/ssr` | `^0.12.3` |
| `@supabase/supabase-js` | `^2.110.7` |
| `next` | `^15.5.20` |
| `qrcode` | `^1.5.4` |
| `react` | `19.2.4` |
| `react-dom` | `19.2.4` |

**devDependencies (`package.json:19-29`):** `@tailwindcss/postcss ^4`, `@types/node ^20`, `@types/qrcode ^1.5.6`, `@types/react ^19`, `@types/react-dom ^19`, `eslint ^9`, `eslint-config-next ^15.5.20`, `tailwindcss ^4`, `typescript ^5`.

**Scripts (`package.json:5-10`):** `dev: next dev` · `build: next build` · `start: next start` · `lint: eslint`.

**إعدادات مهمّة:**
- `next.config.ts:4` — `eslint: { ignoreDuringBuilds: true }`
- `next.config.ts:5` — `typescript: { ignoreBuildErrors: true }` ⚠️ (أخطاء الأنواع لا توقف البناء — انظر §14)
- `tsconfig.json`: `strict: true` (س11)، `noEmit: true`، `moduleResolution: bundler`، alias `@/* → ./src/*` (س25-29).
- `postcss.config.mjs` (plugin `@tailwindcss/postcss`)، `eslint.config.mjs` (يمدّد `next/core-web-vitals` + `next/typescript`).
- لا توجد ملفات اختبار ولا مجلّد `coverage`.

---

## 2. بنية المجلدات (مستويان)

```
/home/user/turn
├── src/                         كود التطبيق (Next.js App Router)
│   ├── app/                     الصفحات والمسارات وServer Actions
│   │   ├── about/               صفحة «عن المنصّة» (عامّة)
│   │   ├── admin/               لوحة مشرف المنصّة + [id] (تحكّم موديولات مطعم)
│   │   ├── contact/             «تواصل معنا» (عامّة)
│   │   ├── dashboard/           لوحة المالك/الموظفين (14 قسمًا فرعيًا)
│   │   ├── diaries/             محتوى/يوميات (عامّة، مكوّن عميل)
│   │   ├── g/[slug]/            «امسح خذ هديتك» — تسجيل حضور الضيف بالQR
│   │   ├── login/               تحويل → /partners فقط
│   │   ├── me/                  مساحة العميل الضيف (favorites, rewards, waitlist)
│   │   ├── partners/            بوابة دخول الشركاء (Auth للمالكين/المشرفين)
│   │   ├── r/[slug]/            صفحة المطعم العامّة + الانضمام للطابور
│   │   ├── restaurants/         تحويل → / (redirect)
│   │   └── search/              بحث عن المطاعم (عامّ)
│   ├── components/              مكوّنات مشتركة (brand, customer-shell, image-uploader, lang-*, logout)
│   └── lib/                     أدوات (features, format, i18n, local-store)
│       └── supabase/            عملاء Supabase (client/server/middleware) + الأنواع + الكاش العام
├── supabase/
│   └── migrations/              12 ملف SQL (المخطط، RLS، الدوال، التزويد) — ناقصة عن القاعدة الحيّة (§10)
├── public/                      أصول ثابتة + manifest.webmanifest (PWA)
├── node_modules/                التبعيات
└── .next/                       ناتج البناء
```

**أقسام `src/app/dashboard/`:** `checkin`, `content`, `customers` (+`[id]`), `loyalty`, `manage`, `offers`, `reception`, `reports`, `reservations`, `reviews`, `staff`, `tables`. ملفات مشتركة: `guard.ts`, `owner-context.ts`, `owner-shell.tsx`, `owner-nav.tsx`, `owner-chrome.tsx`, `queue-actions.tsx`, `waitlist-actions.ts`, `layout.tsx`, `loading.tsx`.

---

## 3. قاعدة البيانات — الجداول والأعمدة والأنواع والمفاتيح الأجنبية

٢٥ جدولًا في مخطط `public` (المصدر: القاعدة الحيّة + `src/lib/supabase/database.types.ts`). المفاتيح الأجنبية مذكورة تحت كل جدول.

1. **restaurants** — `id uuid PK`, `owner_id uuid`, `name text`, `name_en text?`, `slug text UNIQUE`, `logo_url text?`, `cover_url text?`, `phone text?`, `email text?`, `description text?`, `is_active bool`, `claim_code text? UNIQUE`, `claimed_at timestamptz?`, `owner_username text?`, `owner_phone text?`, `links jsonb`, `cuisine text?`, `cuisine_en text?`, `created_at/updated_at`. FK: لا خارجية (owner_id → auth.users منطقيًّا).
2. **branches** — `id uuid PK`, `restaurant_id uuid→restaurants.id`, `name`, `name_en?`, `address?`, `city?`, `lat float8?`, `lng float8?`, `phone?`, `timezone text`, `is_active bool`, `created_at/updated_at`.
3. **branch_settings** — `branch_id uuid PK→branches.id (1:1)`, `accepts_waitlist bool`, `accepts_reservations bool`, `booking_window_days int`, `charge_customer bool`, `default_duration_min int`, `grace_period_min int`, `max_party_size int`, `notification_channels notification_channel[]?`, `opening_hours jsonb?`, `custom jsonb?`, `updated_at`.
4. **tables** — `id uuid PK`, `branch_id uuid→branches.id`, `label text`, `seats int`, `min_seats int?`, `zone text?`, `status table_status`, `sort_order int?`, `is_active bool`, `created_at`. UNIQUE(`branch_id,label`).
5. **customers** — `id uuid PK`, `user_id uuid? UNIQUE` (→auth.users), `full_name text`, `phone text`, `email text?`, `created_at/updated_at`.
6. **customer_restaurant** — `PK(restaurant_id, customer_id)`، `restaurant_id→restaurants.id`, `customer_id→customers.id`, `visits int`, `no_shows int`, `points int`, `tier text`, `is_vip bool`, `is_blocked bool`, `tags text[]`, `note text?`, `first_seen`, `last_visit?`, `updated_at`.
7. **customer_rewards** — `id uuid PK`, `restaurant_id→restaurants.id`, `customer_id→customers.id`, `kind text`, `title text`, `value numeric?`, `value_kind text`, `description text?`, `code text?`, `status text`, `created_by uuid?`, `created_at`, `expires_at?`, `redeemed_at?`.
8. **checkins** — `id uuid PK`, `restaurant_id→restaurants.id`, `branch_id?→branches.id`, `customer_id→customers.id`, `source text`, `created_at`.
9. **checkin_settings** — `restaurant_id uuid PK→restaurants.id (1:1)`, `welcome_enabled bool`, `welcome_kind text`, `welcome_title text`, `welcome_value numeric?`, `welcome_value_kind text`, `welcome_expires_days int`, `updated_at`.
10. **loyalty_programs** — `restaurant_id uuid PK→restaurants.id (1:1)`, `is_active bool`, `points_per_visit int`, `reward_threshold int`, `reward_description text?`, `updated_at`.
11. **waitlist_entries** — `id uuid PK`, `branch_id→branches.id`, `customer_id→customers.id`, `party_size int`, `zone text`, `position int?`, `status waitlist_status`, `quoted_wait_min int?`, `table_id?→tables.id`, `notes?`, `joined_at`, `notified_at?`, `seated_at?`, `updated_at`.
12. **reservations** — `id uuid PK`, `branch_id→branches.id`, `customer_id→customers.id`, `table_id?→tables.id`, `party_size int`, `reserved_at timestamptz`, `duration_min int`, `time_range tstzrange` (يُملأ عبر trigger)، `status reservation_status`, `notes?`, `created_at/updated_at`.
13. **offers** — `id uuid PK`, `restaurant_id→restaurants.id`, `title`, `description?`, `kind offer_kind`, `value numeric?`, `code text?`, `audience text`, `conditions jsonb`, `starts_at?`, `ends_at?`, `is_active bool`, `per_customer_limit int`, `total_limit int?`, `redeemed_count int`, `created_at/updated_at`.
14. **offer_redemptions** — `id uuid PK`, `offer_id→offers.id`, `restaurant_id→restaurants.id`, `branch_id?→branches.id`, `customer_id?→customers.id`, `amount numeric?`, `redeemed_at`.
15. **reviews** — `id uuid PK`, `restaurant_id→restaurants.id`, `branch_id?→branches.id`, `customer_id?→customers.id`, `waitlist_entry_id?→waitlist_entries.id`, `rating int`, `comment text?`, `is_published bool`, `routed_to_google bool`, `created_at`.
16. **menu_categories** — `id uuid PK`, `restaurant_id→restaurants.id`, `name`, `sort_order int`, `created_at`.
17. **menu_items** — `id uuid PK`, `category_id→menu_categories.id`, `restaurant_id→restaurants.id`, `name`, `description?`, `price numeric?`, `image_url?`, `is_available bool`, `sort_order int`, `created_at/updated_at`.
18. **restaurant_photos** — `id uuid PK`, `restaurant_id→restaurants.id`, `url text`, `caption?`, `sort_order int`, `created_at`.
19. **staff** — `id uuid PK`, `user_id uuid`, `restaurant_id→restaurants.id`, `branch_id?→branches.id`, `role user_role`, `permissions jsonb`, `name text?`, `is_active bool`, `created_at`. UNIQUE(`user_id,restaurant_id`).
20. **feature_modules** (كتالوج) — `key text PK`, `name_ar text`, `description_ar text?`, `category text`, `is_core bool`, `default_enabled bool`, `sort_order int`, `created_at`.
21. **restaurant_features** — `PK(restaurant_id, module_key)`، `restaurant_id→restaurants.id`, `module_key→feature_modules.key`, `enabled bool`, `config jsonb`, `enabled_at?`, `updated_at`.
22. **daily_stats** — `PK(branch_id, stat_date)`، `branch_id→branches.id`, عدّادات (`joined/seated/cancelled/no_show/inside/outside_count`), `avg_wait_seconds`, `peak_hour int?`, `updated_at`.
23. **owner_insights** — `id uuid PK`, `restaurant_id→restaurants.id`, `kind text`, `title text`, `body text?`, `data jsonb`, `is_read bool`, `created_at`.
24. **notifications** — `id uuid PK`, `branch_id→branches.id`, `customer_id?→customers.id`, `channel notification_channel`, `template text`, `payload jsonb?`, `delivered bool?`, `sent_at?`, `error text?`, `created_at`. (**غير مستخدم في الكود** — §11)
25. **platform_admins** — `user_id uuid PK`, `created_at`.

**الأنواع المُعدَّدة (enums):** `notification_channel(sms|whatsapp|push|email)`، `offer_kind(percent|fixed|free_item|bogo|points)`، `reservation_status(pending|confirmed|seated|completed|cancelled|no_show)`، `table_status(available|occupied|reserved|inactive)`، `user_role(owner|manager|staff|host)`، `waitlist_status(waiting|notified|seated|cancelled|no_show|expired)`.

**ملاحظة توثيق:** جدول `subscriptions` أُنشئ في `0001` ثم **حُذف** في `0008_waitlist_focus.sql:57-58` (لم يعد موجودًا).

---

## 4. سياسات RLS

**RLS مُفعّل على كل الجداول الـ٢٥ (25/25).** لا يوجد أي جدول بلا RLS.

### جداول غير محمية
**لا يوجد.** كل جدول في `public` عليه `rowsecurity = true` (تحقّق مباشر من `pg_class`). (لا يوجد `FORCE RLS`، لكن لا يُستخدم عميل service_role في الكود — §12.)

### السياسات لكل جدول (نصًّا مختصرًا)
- **restaurants:** SELECT عام للفعّالة (`is_active`)؛ SELECT للمالك (`owner_id=auth.uid()`)؛ SELECT للطاقم (`is_staff_of(id)`)؛ SELECT للمشرف؛ UPDATE للمالك؛ UPDATE لمدير/مشرف (`is_manager_of(id) OR is_platform_admin()`).
- **branches:** SELECT عام للفعّالة؛ SELECT للطاقم؛ ALL لمدير (`is_manager_of`)؛ ALL للمشرف.
- **branch_settings:** SELECT عام لإعدادات الفروع الفعّالة؛ SELECT للطاقم؛ ALL لمدير؛ ALL للمشرف.
- **customers:** SELECT/INSERT/UPDATE للنفس (`user_id=auth.uid()`)؛ SELECT للطاقم عبر `staff_can_read_customer(id)`؛ ALL للمشرف. (لا إدراج ضيف مباشر — يتم عبر دوال DEFINER.)
- **customer_restaurant:** SELECT للعميل عن نفسه؛ SELECT للطاقم (`is_staff_of OR admin`)؛ ALL لمن يملك صلاحية `customers` (`staff_has_perm(...,'customers') OR admin`).
- **customer_rewards:** ALL فقط لمن يملك صلاحية `customers` أو مشرف (دور authenticated). **لا سياسة SELECT للعميل** — قراءة العميل تتم عبر دالة `get_customer_rewards` (DEFINER).
- **waitlist_entries:** INSERT/SELECT للعميل عن نفسه؛ ALL للطاقم (`is_staff_of(restaurant_of_branch(branch_id))`)؛ ALL للمشرف. (انضمام الضيف عبر `join_waitlist_guest` DEFINER.)
- **reservations:** INSERT/SELECT/UPDATE(إلغاء) للعميل عن نفسه؛ ALL للطاقم؛ ALL للمشرف.
- **offers:** SELECT عام «للعروض الحيّة» (`is_active AND within starts/ends`)؛ SELECT للطاقم لكل العروض؛ ALL لصلاحية `offers` أو مشرف.
- **offer_redemptions:** SELECT للعميل عن نفسه؛ SELECT للطاقم؛ INSERT للطاقم (`is_staff_of`).
- **reviews:** SELECT عام للمنشور (`is_published`)؛ INSERT للعميل عن نفسه؛ SELECT للطاقم؛ ALL لصلاحية `reviews` أو مشرف.
- **menu_categories / menu_items:** SELECT عام (`true`)؛ ALL لمدير؛ ALL للمشرف.
- **restaurant_photos:** SELECT عام (`true`)؛ ALL لصلاحية `settings` أو مشرف.
- **loyalty_programs:** SELECT عام للنشط (`is_active`)؛ SELECT للطاقم؛ ALL لصلاحية `loyalty` أو مشرف.
- **checkin_settings:** SELECT للطاقم/مشرف؛ ALL(كتابة) لمدير/مشرف.
- **checkins:** SELECT للطاقم/مشرف؛ ALL للمشرف. **لا سياسة INSERT لغير المشرف** — الكتابة حصريًا عبر `public_checkin` (DEFINER).
- **feature_modules:** SELECT عام (`true`)؛ ALL للمشرف.
- **restaurant_features:** SELECT للطاقم/مشرف؛ ALL للمشرف فقط (تحكّم الباقات بيد المشرف).
- **staff:** SELECT للطاقم؛ ALL لمدير؛ ALL للمشرف.
- **tables:** SELECT للطاقم؛ ALL لمدير؛ ALL للمشرف.
- **daily_stats:** SELECT للطاقم/مشرف فقط (الكتابة عبر دوال DEFINER/cron).
- **owner_insights:** SELECT للطاقم/مشرف؛ UPDATE لمدير/مشرف.
- **notifications:** SELECT للطاقم فقط. **لا سياسة INSERT** (لا يُكتب من التطبيق أصلًا — §11).
- **platform_admins:** RLS مفعّل؛ يُقرأ عبر `is_platform_admin()` (DEFINER) لا مباشرة.

**ملاحظات على السياسات:** الدوال المساعدة كلها `SECURITY DEFINER`: `is_staff_of`, `is_manager_of`, `is_platform_admin`, `staff_has_perm(rest,perm)`, `staff_can_read_customer`, `restaurant_of_branch`. العزل متعدّد المستأجرين يعتمد عليها. قراءة العميل لمكافآته/ولائه تلتفّ حول RLS عبر دوال DEFINER عامّة تأخذ `phone` نصًّا (انظر §14 — تسريب بالرقم).

---

## 5. الفهارس

**كل الفهارس الموجودة (مصدر: `pg_indexes`):**
- **branches:** `branches_pkey`, `idx_branches_restaurant(restaurant_id)`.
- **branch_settings:** `branch_settings_pkey(branch_id)`.
- **checkins:** `checkins_pkey`, `idx_checkins_customer_rest_time(customer_id,restaurant_id,created_at DESC)`, `idx_checkins_restaurant_time(restaurant_id,created_at DESC)`.
- **checkin_settings:** `checkin_settings_pkey(restaurant_id)`.
- **customer_restaurant:** `customer_restaurant_pkey(restaurant_id,customer_id)`, `idx_custrest_customer(customer_id)`, `idx_custrest_vip(restaurant_id) WHERE is_vip`.
- **customer_rewards:** `customer_rewards_pkey`, `idx_customer_rewards_customer(customer_id)`, `idx_customer_rewards_rest_cust(restaurant_id,customer_id)`.
- **customers:** `customers_pkey`, `customers_user_id_key(user_id) UNIQUE`, `idx_customers_phone(phone)`, `idx_customers_user(user_id)`.
- **daily_stats:** `daily_stats_pkey(branch_id,stat_date)`, `idx_daily_stats_date(stat_date)`.
- **feature_modules:** `feature_modules_pkey(key)`.
- **loyalty_programs:** `loyalty_programs_pkey(restaurant_id)`.
- **menu_categories:** `menu_categories_pkey`, `idx_menu_categories_restaurant(restaurant_id)`.
- **menu_items:** `menu_items_pkey`, `idx_menu_items_category(category_id)`, `idx_menu_items_restaurant(restaurant_id)`.
- **notifications:** `notifications_pkey`, `idx_notifications_branch(branch_id)`, `idx_notifications_customer(customer_id)`.
- **offer_redemptions:** `offer_redemptions_pkey`, `idx_offer_redemptions_branch_id`, `idx_redemptions_customer`, `idx_redemptions_offer`, `idx_redemptions_rest_date(restaurant_id,redeemed_at)`.
- **offers:** `offers_pkey`, `idx_offers_code(code) WHERE code IS NOT NULL`, `idx_offers_rest_active(restaurant_id) WHERE is_active`.
- **owner_insights:** `owner_insights_pkey`, `idx_insights_rest(restaurant_id,created_at DESC)`.
- **platform_admins:** `platform_admins_pkey(user_id)`.
- **reservations:** `reservations_pkey`, `idx_reservations_branch`, `idx_reservations_customer`, `idx_reservations_reserved_at`, `idx_reservations_status`, `no_double_booking` GiST(`table_id,time_range`) WHERE status∈(pending,confirmed,seated).
- **restaurant_features:** `restaurant_features_pkey(restaurant_id,module_key)`, `idx_restaurant_features_enabled(restaurant_id) WHERE enabled`, `idx_restaurant_features_module_key(module_key)`.
- **restaurant_photos:** `restaurant_photos_pkey`, `idx_restaurant_photos(restaurant_id,sort_order,created_at)`.
- **restaurants:** `restaurants_pkey`, `restaurants_slug_key(slug) UNIQUE`, `restaurants_claim_code_key(claim_code) UNIQUE`, `idx_restaurants_owner(owner_id)`.
- **reviews:** `reviews_pkey`, `idx_reviews_branch_id`, `idx_reviews_customer`, `idx_reviews_pub_restaurant(restaurant_id) WHERE is_published`, `idx_reviews_rest(restaurant_id,created_at DESC)`, `idx_reviews_waitlist_entry_id`.
- **staff:** `staff_pkey`, `staff_user_id_restaurant_id_key(user_id,restaurant_id) UNIQUE`, `idx_staff_branch`, `idx_staff_restaurant`, `idx_staff_user`.
- **tables:** `tables_pkey`, `tables_branch_id_label_key(branch_id,label) UNIQUE`, `idx_tables_branch`.
- **waitlist_entries:** `waitlist_entries_pkey`, `idx_waitlist_active(branch_id,position) WHERE status∈(waiting,notified)`, `idx_waitlist_branch`, `idx_waitlist_branch_joined`, `idx_waitlist_branch_seated WHERE status=seated`, `idx_waitlist_customer`, `idx_waitlist_live_branch(branch_id) WHERE status∈(waiting,notified)`, `idx_waitlist_status`, `idx_waitlist_table WHERE table_id NOT NULL`.

**أعمدة تُستخدم في الفلترة بلا فهرس مخصّص (مرشّحات محتملة):**
- **`restaurants.is_active` + `restaurants.created_at`** — قائمة الاكتشاف (`src/lib/supabase/public-cache.ts:37-41`) تفلتر `is_active=true` وتُرتّب `created_at desc`؛ لا فهرس على أيٍّ منهما ⇒ Seq Scan. مقبول الآن (جدول صغير + `limit 60`)، لكن يكبر مع آلاف المطاعم.
- **`offers.audience`** — يُفلتر `.in("audience",['all','new'])` (`public-cache.ts`, `r/[slug]/page.tsx:37`) بلا فهرس على `audience`؛ مغطّى جزئيًّا بـ `idx_offers_rest_active`، والكاردناليتي منخفضة ⇒ أثر ضئيل.
- **`customers.phone`** مفهرس (`idx_customers_phone`) — بحث المكافآت بالرقم مغطّى.
- الباقي (فروع/طابور/عملاء/مكافآت) مفهرس جيّدًا بمفاتيح المطعم/الفرع.

---

## 6. المصادقة والأدوار

**الآلية:** Supabase Auth عبر `@supabase/ssr` مع تخزين الجلسة في **cookies**. ثلاثة عملاء: خادم `src/lib/supabase/server.ts:9-33` (يقرأ/يكتب الكوكيز عبر `next/headers`)، متصفّح `src/lib/supabase/client.ts:8-13` (مفتاح anon)، middleware `src/lib/supabase/middleware.ts:9-48` (يجدّد الجلسة بـ `getUser()` — `middleware.ts:34-36`).

**إنشاء الجلسة:** دخول الملّاك/الموظفين في `src/app/partners/page.tsx:43-46` عبر `signInWithPassword`. **لا بريد حقيقي:** اسم المستخدم يُحوَّل إلى بريد اصطناعي `${user}@turn.app` إن لم يحتوِ `@` (`partners/page.tsx:40`)، وكلمة المرور هي «الرمز» (`page.tsx:45`). بعد الدخول يُتحقّق أن `Restaurant ID` المُدخل يطابق مطعمًا للمستخدم في `staff` (`page.tsx:54-72`)، ويتجاوزه المشرف (`isAdmin`).

**حماية المسارات:** الـ middleware يعمل فقط على `/dashboard/:path*` و`/admin/:path*` (`src/middleware.ts:12`)؛ غير المسجّل يُحوَّل إلى `/partners?redirect=...` (`middleware.ts:39-45`). صفحات العميل العامّة لا تمرّ به إطلاقًا.

**الأدوار الفعليّة في الكود:**
- `user_role` enum: **`owner | manager | staff | host`** (`database.types.ts`، مصفوفة القيم في `Constants`).
- صلاحيات الموظفين `STAFF_PERMISSIONS` (تسع): `waitlist, reservations, analytics, offers, loyalty, customers, reviews, settings, team` (`src/lib/features.ts:105-115`).
- `staffHasPermission` (`features.ts:134-141`): **owner/manager يملكان كل الصلاحيات ضمنيًّا**؛ غيرهما حسب خريطة `permissions`.

**عزل مالك عن آخر (Tenant Isolation):**
- `resolveCaller` (`src/app/dashboard/guard.ts:29-65`): يقرأ المستخدم، يجلب صفّ `staff` واحدًا مرتّبًا `.order("role")` مع `is_active` (يختار المطعم المملوك)، يعيد `restaurantId/role/permissions`.
- `requirePerm(perm)` (`guard.ts:68-73`) — فشل صامت آمن (`null`) لغير المخوّل.
- `callerBranchIds(caller)` (`guard.ts:76-82`) — يضيّق التحديثات على فروع مطعم المتصل (دفاع في العمق فوق RLS)، مثال `src/app/dashboard/waitlist-actions.ts:19-26`.
- نفس المنطق في `loadOwner` (`src/app/dashboard/owner-context.ts:77-84`) مع تحميل الموديولات عبر `getEnabledModules` (`features.ts:60-85`).

**كوكي المشرف `admin_rid`:** الثابت `ADMIN_RID_COOKIE="admin_rid"` (`owner-context.ts:14`). يُكتب في `openRestaurantDashboard` بعد التحقّق `is_platform_admin` (`src/app/admin/actions.ts:13-24`, `httpOnly`) ويُمسح في `exitAdminView` (`actions.ts:28-32`). يُقرأ في `resolveCaller` (`guard.ts:37-44`) و`loadOwner` (`owner-context.ts:47-73`) **وكلاهما يتحقّق `is_platform_admin` عبر RPC قبل احترامه** ⇒ الكوكي وحده لا يمنح شيئًا.

**الضيوف مقابل المسجّلين:** الضيف (بلا حساب) هو النموذج الفعلي للعميل: انضمام الطابور `join_waitlist_guest` (`src/app/r/[slug]/actions.ts:16-63`)، تسجيل الحضور `public_checkin` (`src/app/g/[slug]/actions.ts:39`)، والمكافآت بالرقم من `localStorage` (`me/rewards/page.tsx:46-49`). `src/app/login/page.tsx` مجرّد `redirect("/partners")` — **لا يوجد تسجيل دخول للعميل**. يوجد مسار مصادق بديل `joinWaitlist` (`r/[slug]/actions.ts:76-155`) لكن **غير واضح** استخدامه لغياب واجهة دخول للعميل.

---

## 7. Realtime

**غير مستخدم إطلاقًا.** بحث كامل في `src` عن `.channel(`, `postgres_changes`, `realtime`, `.subscribe(`, `removeChannel`, `broadcast` — **لا مطابقة**.

- لا اشتراكات (لا per-customer ولا per-branch/restaurant)، وبالتالي **لا إلغاء اشتراك** أصلًا.
- التحديثات «الحيّة» في اللوحة تعتمد **إعادة تحقّق الصفحة** (`revalidatePath`) بعد كل فعل، مثل `src/app/dashboard/waitlist-actions.ts:27-28`. أي أن شاشة الاستقبال/الطابور **لا تتحدّث تلقائيًّا** بل تحتاج إعادة تحميل/فعل.
- `RewardsBadge` (`src/app/me/rewards-badge.tsx`) يستخدم `useEffect` مع علم `cancelled` للتنظيف، لكنه استعلام RPC لمرّة واحدة لا اشتراك Realtime.

---

## 8. الصفحات والمسارات

**عامّة (لا تمرّ بالـ middleware):**
| المسار | الملف | الوظيفة | الوصول |
|---|---|---|---|
| `/` | `src/app/page.tsx` | الرئيسية/اكتشاف المطاعم | عام |
| `/about` | `about/page.tsx` | عن المنصّة | عام |
| `/contact` | `contact/page.tsx` | تواصل معنا | عام |
| `/diaries` | `diaries/page.tsx` | يوميات/محتوى | عام |
| `/search` | `search/page.tsx` | بحث عن المطاعم | عام |
| `/restaurants` | `restaurants/page.tsx:5` | تحويل → `/` | عام |
| `/login` | `login/page.tsx:5` | تحويل → `/partners` | عام |
| `/r/[slug]` | `r/[slug]/page.tsx` | صفحة المطعم + انضمام الطابور | عام (ديناميكي) |
| `/g/[slug]` | `g/[slug]/page.tsx` | تسجيل حضور الضيف (QR) | عام (ديناميكي) |
| `/me` | `me/page.tsx:70` | حساب الضيف | عام (ضيف) |
| `/me/favorites` | `me/favorites/page.tsx` | المفضّلة (localStorage) | عام (ضيف) |
| `/me/rewards` | `me/rewards/page.tsx:32` | مكافآت العميل بالرقم | عام (ضيف) |
| `/me/waitlist` | `me/waitlist/page.tsx` | أدواري في الطوابير | عام (ضيف) |
| `/partners` | `partners/page.tsx:11` | بوابة دخول الشركاء | عام (Auth) |

**لوحة المالك/الموظفين (`loadOwner` + module + perm):**
| المسار | الوظيفة | فحص الوصول |
|---|---|---|
| `/dashboard` | نظرة عامّة | أي موظف فعّال |
| `/dashboard/checkin` | ملصق «امسح خذ هديتك» + إحصاءات | module `checkin` + perm `loyalty` |
| `/dashboard/reception` | الاستقبال/walk-in | perm `waitlist` |
| `/dashboard/reservations` | الحجوزات | perm `reservations` |
| `/dashboard/offers` | العروض | module `offers` + perm `offers` |
| `/dashboard/loyalty` | الولاء | module `loyalty` + perm `loyalty` |
| `/dashboard/customers` (+`/[id]`) | العملاء (CRM) + منح مكافأة | module `crm` + perm `customers` |
| `/dashboard/reviews` | التقييمات | module `reviews` + perm `reviews` |
| `/dashboard/reports` | التقارير | module `analytics` + perm `analytics` |
| `/dashboard/staff` | الفريق والصلاحيات | perm `team` |
| `/dashboard/tables` | الطاولات | perm `settings` |
| `/dashboard/content` | المحتوى/المعرض | perm `settings` |
| `/dashboard/manage` | إعدادات المطعم + القائمة | perm `settings` |

**مشرف المنصّة:**
| المسار | الوظيفة | الوصول |
|---|---|---|
| `/admin` | كل المطاعم + إنشاء مطعم | `is_platform_admin` وإلا →`/dashboard` |
| `/admin/[id]` | تفعيل/تعطيل موديولات مطعم | `is_platform_admin` (ديناميكي) |

---

## 9. الـAPI والدوال

**مسارات API (`route.ts`): غير موجود.** لا Route Handlers إطلاقًا؛ كل منطق الخادم عبر **Server Actions** (`actions.ts` في `admin/`, `admin/[id]/`, و`dashboard/*/`).

**وظائف Edge:** مجلّد `supabase/functions` **غير موجود** في المستودع. لكن التطبيق يستدعي edge function **`provision-owner`** (إنشاء مالك/مطعم + توليد كلمة مرور) عبر `fetch(${url}/functions/v1/provision-owner)` في `src/app/admin/actions.ts:78` — **كود الوظيفة غير موجود في المستودع**.

**دوال قاعدة البيانات (RPC) — كلها `SECURITY DEFINER` إلا المُشار إليها INVOKER:**
- عامّة للضيف/anon: `join_waitlist_guest`, `cancel_waitlist_guest`, `create_reservation_guest`, `public_checkin`, `get_customer_rewards`, `get_customer_loyalty`, `redeem_customer_reward`, `waitlist_counts`, `waitlist_counts_for`, `active_waitlist_counts`.
- إدارية/مصادقة: `admin_create_restaurant`, `claim_restaurant`, `create_restaurant_with_branch`, `grant_reward_to_segment`, `set_staff_permission`.
- مساعدات RLS: `is_staff_of`, `is_manager_of`, `is_platform_admin`, `staff_has_perm`, `staff_can_read_customer`, `restaurant_of_branch`, `has_feature`.
- Triggers/داخلية: `set_reservation_time_range` (INVOKER)، `set_waitlist_position`, `on_waitlist_status_change` (مكافأة ولاء عند الجلوس)، `create_default_branch_settings`, `touch_updated_at` (INVOKER)، `gen_claim_code` (INVOKER)، `rls_auto_enable`.
- تجميع/جدولة: `rollup_daily_stats`, `rollup_all_daily_stats`, `run_daily_digest`, `run_slow_hours`, **`demo_live_activity`** (§10/§14).

**مهام pg_cron (من `cron.job` الحيّة):**
1. `10 0 * * *` → `rollup_all_daily_stats(current_date-1)` (نشط)
2. `20 0 * * *` → `run_daily_digest()` (نشط)
3. `0 * * * *` → `run_slow_hours()` (نشط)
4. **`* * * * *` → `demo_live_activity()` (نشط)** ⚠️ كل دقيقة على الإنتاج.

---

## 10. حالة الاكتمال

### ما يعمل فعلاً (موصول من الطرف إلى الطرف)
- طابور الضيف: `r/[slug]/actions.ts:16-72` + إدارة اللوحة `dashboard/waitlist-actions.ts`.
- الاستقبال/walk-in: `dashboard/reception/walkin-actions.ts:6-30`.
- «امسح خذ هديتك»: `g/[slug]/actions.ts:29-67` (`public_checkin`) — زيارة + هدية ترحيب + نقاط ولاء (مُختبر).
- عرض مكافآت/ولاء العميل بالرقم: `me/rewards/page.tsx:46-49`.
- منح/إلغاء/اعتماد مكافآت + حملات الشرائح: `dashboard/customers/actions.ts:9-140`.
- العروض: `dashboard/offers/actions.ts` + عرضها للعميل `r/[slug]/page.tsx:37` + شريط العروض الرئيسية `src/lib/supabase/public-cache.ts` / `src/app/discovery-list.tsx`.
- الولاء + إعدادات الترحيب: `dashboard/loyalty/actions.ts`, `dashboard/checkin/actions.ts`.
- إدارة المطعم/القائمة/الطاولات/المحتوى + رفع الصور لـStorage: `dashboard/manage/actions.ts`, `dashboard/tables/actions.ts`, `dashboard/content/*`, `src/components/image-uploader.tsx:52-63`.
- الحجوزات (جهة الموظف): `dashboard/reservations/actions.ts` (`create_reservation_guest`).
- الطاقم والصلاحيات: `dashboard/staff/actions.ts` (`set_staff_permission`).
- توفير المطاعم بواسطة الأدمِن + تبديل الموديولات: `admin/actions.ts`, `admin/[id]/actions.ts:8-31`.
- التقارير من بيانات فعلية: `dashboard/reports/page.tsx`.
- تذكير واتساب: `dashboard/queue-actions.tsx:33-42` (يفتح `wa.me` + يضبط `notified_at`).

### ناقص أو مؤقت (بدليل)
- **استقبال التقييمات غير منفّذ:** لا `insert` إلى `reviews` في أي مكان، ولا واجهة إدخال للعميل (تبويبات العرض فقط `r/[slug]/restaurant-tabs.tsx:27`). اللوحة تنشر فقط (`dashboard/reviews/actions.ts` = `toggleReviewPublish`). ⇒ لا تظهر تقييمات إلا بإدخال يدوي في القاعدة.
- **«توجيه التقييم الذكي» تجميلي:** `dashboard/reviews/page.tsx:41,74-84` تعرض لافتة وتعدّ `routed_to_google` لكن **لا كتابة لهذه القيمة في أي ملف**.
- **حجوزات العميل معلَنة بلا مسار:** يُعلن عنها في `about/page.tsx:11` و`me/page.tsx:106`، لكن لا تبويب/صفحة حجز للعميل. الحجز من اللوحة فقط.
- **«إرسال الحملة» لا يُرسل شيئًا:** الواجهة تقول «أرسل/ستصل إلى X» (`customers/campaign-form.tsx:33,125`) بينما `grantRewardToSegment` (`customers/actions.ts:96`) **يُدرج صفوفًا فقط**؛ لا قناة تبليغ في المستودع.
- **`demo_live_activity` مولّد تجريبي يتيم لكن مجدول:** موجود في القاعدة (نوعه في `database.types.ts`)، **غير مُعرّف في أي migration** وغير مستدعى في `src`، ومع ذلك **مجدول cron كل دقيقة على الإنتاج** (§9). محتواه الداخلي **غير واضح** (تعريفه غير موجود بالمستودع) — يُرجّح توليد نشاط/بيانات وهمية.
- **`claim_restaurant` غير موصولة بالواجهة:** مُعرّفة في `0010_admin_provisioning.sql:126` لكن لا تُستدعى من `src` (استُبدلت بـ edge function).
- **انجراف الهجرات (أخطر فجوة اكتمال):** المستودع **لا يستطيع إعادة بناء قاعدة الإنتاج**. جداول مستخدمة وغير مُنشأة في أي migration: `checkin_settings, checkins, customer_restaurant, customer_rewards, feature_modules, loyalty_programs, offers, offer_redemptions, owner_insights, restaurant_features, restaurant_photos, reviews, daily_stats`. ودوال يستدعيها التطبيق وغير مُعرّفة في migration: `public_checkin, get_customer_rewards, get_customer_loyalty, grant_reward_to_segment, create_reservation_guest, set_staff_permission, on_waitlist_status_change, demo_live_activity`. طُبِّقت على القاعدة الحيّة عبر Supabase MCP لا عبر ملفات الهجرة.

**بحث الجودة:** لا يوجد أي `TODO/FIXME/HACK/XXX` ولا `throw new Error` ولا `console.*` في كامل `src`/`supabase` (0 نتيجة). كل `placeholder` هي نصوص حقول إدخال مشروعة. الـ`return;` المبكرة في الـactions كلها حرّاس صلاحيات (`if(!caller) return;`) لا stubs.

---

## 11. الإشعارات

**لا يوجد نظام إشعارات فعلي.** جدول `notifications` موجود في المخطط (§3) لكنه **غير مستخدم في الكود** (لا `from("notifications")` في `src`).

- «إشعار» الطابور = تغيير حالة DB فقط: `updateWaitlistStatus(id,"notified")` يضبط `status/notified_at` (`dashboard/waitlist-actions.ts:14-26`) ويظهر وسم «أُشعِر ✓» في الاستقبال (`dashboard/reception/page.tsx:68`). لا يصل العميل شيء آليًّا.
- «شارة» المكافآت داخل التطبيق: `RewardsBadge` (`me/rewards-badge.tsx:7-35`) تعدّ الهدايا النشطة غير المرئية عبر RPC + قائمة `turn:seen_rewards` في `localStorage`.
- **لا إرسال فعلي لأي SMS/Push/Email** في كامل `src` (لا twilio/web-push/nodemailer/إلخ). القناة الوحيدة شبه-التبليغية: زر واتساب اليدوي (`queue-actions.tsx:33-42`) يفتح `wa.me`.
- **غير واضح** ما إذا كانت أي وظيفة خادمية خارج المستودع (edge/trigger) تكتب في `notifications` أو ترسل فعليًّا.

---

## 12. البيئة

**متغيّرات البيئة المستخدمة (اثنان فقط):**
- `NEXT_PUBLIC_SUPABASE_URL` — أول استخدام `src/lib/supabase/public-cache.ts:12` (وكذلك `client.ts:10`, `server.ts:13`, `middleware.ts:13`, `admin/actions.ts:73`).
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — `public-cache.ts:13` (ونفس الملفات).
- **`SUPABASE_SERVICE_ROLE_KEY` لا يُستخدم في أي كود** (وارد فقط كتعليق محذّر في `.env.example`).

**ملفات البيئة:**
- `.env.example` (متتبَّع): مفتاحان فارغان + تحذير من service_role.
- `.env.local` (**غير متتبَّع**، `.gitignore:34`): `URL=https://nkdfxmjuigslmangzuua.supabase.co`، `ANON_KEY=sb_publishable_...` (مفتاح publishable عام).
- `.env.production` (**متتبَّع في git** — استثناء صريح `.gitignore` `!.env.production`): نفس القيمتين العامّتين.

**أسرار مكشوفة في الكود:** **لا يوجد مفتاح سرّي مكشوف** (لا `service_role` ولا JWT ولا كلمات مرور نصّية). القيم الظاهرة هي مفتاح anon/publishable فقط (آمن للعلن حسب تصميم Supabase؛ الحماية عبر RLS). كلمات مرور المطاعم تُولَّد خادميًّا وتُعاد كـ`state.ok.code` (`admin/actions.ts:100`, `admin/admin-create-form.tsx:27`) — لا تُخزَّن نصًّا في المصدر.

**بذرة مزروعة:** UUID مشرف واحد في `supabase/migrations/0010_admin_provisioning.sql:36` (`insert into platform_admins ...`). نطاق البريد الاصطناعي `@turn.app` ثابت في `partners/page.tsx:40`.

---

## 13. النشر

- **Vercel:** `vercel.json` موجود ومحتواه `{ "regions": ["fra1"] }` (فرانكفورت، موافق لمنطقة Supabase). مجلّد `.vercel` غير موجود (متجاهَل). النشر على الأرجح عبر تكامل Vercel–Git المباشر.
- **CI:** لا يوجد `.github/workflows` ولا أي CI/اختبارات.
- **سكربت البناء:** `build: next build` موجود.
- **هل ينجح البناء؟** نعم — `npm run build` نجح محليًّا عدّة مرّات خلال هذه الجلسة. **تنبيه:** البناء **متساهل** — `next.config.ts:4-5` يتجاهل أخطاء ESLint وأخطاء TypeScript، فقد تُنشر أخطاء أنواع صامتة (§14).

---

## 14. مخاطر وثغرات — أخطر ١٠ (مرتّبة بالخطورة) عند إطلاق ١٠٠٠ مطعم وعشرات آلاف المستخدمين يوميًّا

1. **انجراف الهجرات / لا مصدر حقيقة للمخطط (كارثة استرداد).** ~١٣ جدولًا و٨ دوال (بما فيها `on_waitlist_status_change`, `public_checkin`) + edge function `provision-owner` **غير موجودة في المستودع**؛ طُبِّقت على القاعدة الحيّة عبر MCP. لا يمكن إعادة بناء الإنتاج أو إنشاء بيئة اختبار من الكود. أي فقد/عطب = لا مرجع. **الأخطر تشغيليًّا.** (المصدر: `supabase/migrations/` مقابل القاعدة الحيّة.)

2. **تسريب بيانات العميل بالرقم فقط (خصوصية).** `get_customer_rewards(p_phone)` و`get_customer_loyalty(p_phone)` دوال `SECURITY DEFINER` عامّة لـanon؛ إدخال **أي رقم** يُظهر هدايا/نقاط صاحبه بلا أي تحقّق (OTP). قابل للتعداد آليًّا على ملايين الأرقام. (`me/rewards/page.tsx:46-49`.)

3. **لا حدّ معدّل (rate limiting) على دوال anon الحسّاسة.** `join_waitlist_guest`, `public_checkin`, `create_reservation_guest`, `get_customer_rewards`, `get_customer_loyalty` كلها ممنوحة لـanon بلا throttle/captcha ⇒ إغراق الطوابير/الحجوزات بصفوف وهمية، تلويث بيانات المطاعم، وتضخّم كلفة القاعدة. (`r/[slug]/actions.ts`, `g/[slug]/actions.ts`.)

4. **cron تجريبي يعمل كل دقيقة على الإنتاج.** `demo_live_activity()` مجدول `* * * * *` (نشط، jobid 4) — يولّد نشاطًا وهميًّا في بيانات حيّة (يُرجّح حجوزات/عملاء مزيّفون)، يفسد التحليلات والطوابير الحقيقية ويستهلك موارد باستمرار. تعريفه غير موجود بالمستودع (سلوكه غير موثّق). **يجب إيقافه قبل الإطلاق.**

5. **البناء يتجاهل أخطاء الأنواع وESLint.** `next.config.ts:4-5` (`ignoreBuildErrors`, `ignoreDuringBuilds`) ⇒ أخطاء منطقية/أنواع تُنشر صامتة إلى الإنتاج بلا حاجز. مع غياب أي اختبارات/CI، لا شبكة أمان للجودة.

6. **لا Realtime + نموذج `revalidatePath` ثقيل.** شاشات الطابور/الاستقبال **لا تتحدّث تلقائيًّا** (§7)؛ الطاقم يرى بيانات قديمة ما لم يُعِد التحميل، وكل فعل يعيد تحقّق مسارات كاملة. مع مئات الفروع المتزامنة = تجربة تشغيلية سيّئة وحمل خادم أعلى.

7. **هويّة العميل = رقم غير موثّق + localStorage (اختطاف سهل).** لا OTP ولا حساب؛ من يعرف رقم شخص يرى محفظته/هداياه ويعتمدها. لا فصل جهاز/تحقّق. (يترابط مع #2.) نموذج مقبول للتجربة، خطير عند الحجم.

8. **ميزات مُعلَنة غير عاملة (مخاطرة مصداقية/منتَج).** استقبال التقييمات **غير منفّذ** و«التوجيه الذكي» تجميلي (§10)؛ حجوزات العميل معلَنة بلا مسار؛ «إرسال الحملة» لا يُبلّغ أحدًا (لا قناة SMS/Push/Email أصلًا — §11). وعود ظاهرة للمستخدم/المالك بلا تنفيذ.

9. **جاهزية الحِمل والنسخ الاحتياطي غير مؤكّدة.** مشروع Supabase واحد؛ لا دليل في المستودع على PITR/نسخ احتياطي أو ترقية طبقة الحوسبة. قائمة الاكتشاف تفلتر/ترتّب `restaurants` بلا فهرس على `is_active/created_at` (§5) — Seq Scan يكبر مع آلاف المطاعم (مخفَّف حاليًّا بـ`limit 60` + كاش ٣٠ث). لا صفحنة (pagination) عميقة.

10. **نظافة الأسرار وحسابات ثابتة.** `.env.production` **متتبَّع في git** (حاليًّا مفتاح publishable آمن، لكن النمط خطر — أي سرّ يُضاف لاحقًا يتسرّب). مشرف وحيد مزروع بـUUID (`0010:36`)، وبريد اصطناعي ثابت `@turn.app`، وكلمات مرور مطاعم تُعرض مرّة عبر واجهة الإنشاء — تحتاج سياسة تدوير/إبطال.

---

*نهاية التقرير. لم يُعدَّل أي ملف عدا `STATUS.md`.*
