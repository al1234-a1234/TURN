-- ============================================================================
--  الإصلاح: ترقيم الطابور يبدأ من 1 كل يوم (بتوقيت الرياض).
--  set_waitlist_position كان يحسب max(position)+1 عبر كل صفوف الفرع الحيّة
--  (waiting/notified) بلا تصفير يومي، فترث الأرقام قيمًا منتفخة من صفوف قديمة.
--  التعديل: إضافة شرط «اليوم بتوقيت الرياض» فقط (joined_at هو وقت إنشاء الصف؛
--  لا يوجد عمود created_at في waitlist_entries). لا تغيير لأي منطق آخر.
-- ============================================================================
create or replace function public.set_waitlist_position()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
    if new.position is null then
        select coalesce(max(w.position), 0) + 1
          into new.position
          from public.waitlist_entries w
         where w.branch_id = new.branch_id
           and w.status in ('waiting', 'notified')
           and (w.joined_at at time zone 'Asia/Riyadh')::date
             = (now()        at time zone 'Asia/Riyadh')::date;
    end if;
    return new;
end;
$function$;
