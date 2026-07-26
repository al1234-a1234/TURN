-- ============================================================================
--  تحصين التحمّل قبل إطلاق ١٠٠٠ مطعم.
--  ١) فهرس تعبيري للجوّال المطبّع: public_checkin كان يمسح جدول العملاء كاملًا
--     عند كل مسح QR (مطابقة تعبير بلا فهرس) — قاتل بملايين العملاء.
--  ٢) قفل استشاري لكل فرع في ترقيم الدور: max()+1 تحت التزامن يكرّر الرقم.
--     القفل يسلسل الإدخال داخل الفرع فقط ويُفكّ آليًّا بنهاية المعاملة.
-- ============================================================================
create index if not exists idx_customers_phone_norm
  on public.customers (right(regexp_replace(coalesce(phone,''), '\D', '', 'g'), 9));

create or replace function public.set_waitlist_position()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
    if new.position is null then
        perform pg_advisory_xact_lock(hashtext(new.branch_id::text));
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
