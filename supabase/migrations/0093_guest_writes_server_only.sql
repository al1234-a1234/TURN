-- ‏✅ مُطبَّق على الإنتاج ومُتحقَّقٌ منه — ٩ أغسطس ٢٠٢٦.
--
-- وقصّته تستحقّ البقاء لأنّ فيها الدرس:
--
-- ١) طُبِّق أوّل مرّة بعد النشر وبعد أن قال `/api/health`: `writer: true`.
--    فانكسر `/api/my-status` فورًا بـ«permission denied» — أي أنّ النداء
--    وصل القاعدة بدور الضيف. تُرووجِع خلال ٤٠ ثانية.
--
-- ٢) والعطب كان في الحارس لا في الترحيل: كان يفحص أنّ المتغيّر غير فارغ،
--    لا أنّه يعمل. فأُصلح في 0097 بمسبارٍ لا يملك تنفيذه إلا `service_role`،
--    ثم أُصلح ثانيةً ليقول سببَ الرفض لا «لا» وحدها.
--
-- ٣) فقال المسبار المُفصِح: `key_kind: "sb_publishable"` — أي أنّ
--    `SUPABASE_SERVICE_ROLE_KEY` في بيئة الإنتاج كان يحمل مفتاح المتصفّح
--    العلنيّ. صُحّح، فصار `key_kind: "sb_secret"` و`writer: true`.
--
-- ٤) عندها أُعيد تطبيق هذا الملفّ، وتُحقّق منه فورًا: `/api/my-status`
--    رجع 200 — المسار نفسه الذي انكسر أوّلًا. ثم جرّب المالك بجوّاله:
--    نجح الانضمام، ووصله الإشعار — وهو أوّل إشعارٍ منذ ٢٩ يوليو، فقد كان
--    مفتاحُ الخدمة المعطوب يُسقط كلّ إشعارٍ صامتًا.
--
-- والقاعدة التي خرجنا بها: الترحيل الذي يسحب صلاحيةً يقرؤها كودٌ منشور
-- يُطبَّق بعد النشر لا قبله — وبعد أن يُثبت الحارسُ عملَ ما يحرسه، لا
-- حضورَه فحسب.
--
-- ══ لماذا أصلًا ══
--
-- مفتاح `anon` علنيٌّ بحكم التعريف: يُشحن في حزمة المتصفّح، ومن فتح
-- الصفحة يملكه. فكان أيّ أحدٍ ينادي PostgREST مباشرةً بلا مرورٍ بخادمنا،
-- وكلّ حارسٍ بنيناه هناك — حدّ العنوان، تطبيع الرقم، قصّ القسم إلى أقسام
-- الفرع، سقف الحجم — يُتخطّى بنداءٍ واحد. وحارسٌ يُلتفّ حوله ليس حارسًا،
-- بل شعورٌ بالأمان.
--
-- وسقوف القاعدة تبقى (٣ انضمامات لكلّ رقم/١٠د، ٣٠٠ صفًّا حيًّا لكلّ فرع)،
-- لكنّها تحدّ الضرر ولا تمنع المحاولة: كلّها تُقاس بالرقم أو بالفرع،
-- والمهاجم يملك أرقامًا بلا حدّ.
--
-- ولا توسّع في الصلاحية بهذا التغيير: الدوالّ تعمل بصلاحية مالكها منذ
-- اليوم الأول. المتغيّر الوحيد: من يُسمح له بطرق الباب.

-- ══ (١) الكتابة: تمرّ بخادمنا أو لا تمرّ ══
--
-- والسحب من `authenticated` أيضًا لا من `anon` وحدها. فالتسجيل في التطبيق
-- مجّانيٌّ وآليّ، ومن سحبتَ عنه الصلاحية كضيفٍ يستعيدها بإنشاء حسابٍ في
-- ثانية. حاجزٌ يُتخطّى بضغطة «سجّل» ليس حاجزًا.
-- (وهذه هي المصيدة نفسها التي وقعنا فيها في 0089 بصيغةٍ أخرى: هناك
--  نسينا المورِّث PUBLIC، وهنا كدنا ننسى الوريث `authenticated`.)

revoke execute on function public.join_waitlist_guest(uuid, text, text, integer, text) from public, anon, authenticated;
grant  execute on function public.join_waitlist_guest(uuid, text, text, integer, text) to service_role;

-- الحجز يستدعيه أيضًا صندوق الاستقبال بحساب الموظّف، فيبقى له
revoke execute on function public.book_reservation_guest(uuid, text, text, timestamptz, integer, text, text) from public, anon;
grant  execute on function public.book_reservation_guest(uuid, text, text, timestamptz, integer, text, text) to authenticated, service_role;

revoke execute on function public.cancel_waitlist_guest(uuid, text) from public, anon, authenticated;
grant  execute on function public.cancel_waitlist_guest(uuid, text) to service_role;

revoke execute on function public.cancel_reservation_guest(uuid, text) from public, anon, authenticated;
grant  execute on function public.cancel_reservation_guest(uuid, text) to service_role;

revoke execute on function public.cancel_by_ticket(uuid) from public, anon, authenticated;
grant  execute on function public.cancel_by_ticket(uuid) to service_role;

revoke execute on function public.confirm_attendance(uuid) from public, anon, authenticated;
grant  execute on function public.confirm_attendance(uuid) to service_role;

revoke execute on function public.save_push_subscription(uuid, text, text, text, text) from public, anon, authenticated;
grant  execute on function public.save_push_subscription(uuid, text, text, text, text) to service_role;

revoke execute on function public.set_entry_distance(uuid, double precision, double precision) from public, anon, authenticated;
grant  execute on function public.set_entry_distance(uuid, double precision, double precision) to service_role;

revoke execute on function public.submit_review(text, text, integer, text) from public, anon, authenticated;
grant  execute on function public.submit_review(text, text, integer, text) to service_role;

revoke execute on function public.set_reward_armed_by_phone(uuid, text, boolean) from public, anon, authenticated;
grant  execute on function public.set_reward_armed_by_phone(uuid, text, boolean) to service_role;

-- ══ (٢) القراءة بالرقم: بابُ تعداد الأرقام ══
-- هاتان تُدخَلان برقم جوّالٍ وتُخرجان ما عند صاحبه. وهما تُستدعيان من
-- مسارَي API عندنا لا من المتصفّح، فسحبُهما من anon يُجبر المُعدِّد على
-- المرور بخادمنا حيث يعمل حدّ العنوان. وبقاؤهما مفتوحتين يعني أنّ من
-- يملك قائمة أرقامٍ سعوديّة يسحب حالة كلّ صاحب رقمٍ منها بلا أثر.
revoke execute on function public.guest_status_by_phone(text) from public, anon, authenticated;
grant  execute on function public.guest_status_by_phone(text) to service_role;

revoke execute on function public.rewards_by_phone(text) from public, anon, authenticated;
grant  execute on function public.rewards_by_phone(text) to service_role;

-- ══ (٣) دوالّ المُطلِقات: لا تُنادى أصلًا ══
-- هذه أجسادُ triggers، يستدعيها المحرّك لا المستخدم. ومنحُها للجميع
-- سهوٌ موروثٌ من PUBLIC لا قرار — ومناداتها يدويًّا تتخطّى المُطلِق
-- وتكتب في `new` سياقًا لا معنى له. (تكملةٌ لما بدأ في 0089.)
revoke execute on function public.enforce_zone_belongs_to_branch()     from public, anon, authenticated;
revoke execute on function public.enforce_reservations_need_tables()   from public, anon, authenticated;
revoke execute on function public.close_reservations_when_no_tables()  from public, anon, authenticated;
revoke execute on function public.create_default_branch_zones()        from public, anon, authenticated;
