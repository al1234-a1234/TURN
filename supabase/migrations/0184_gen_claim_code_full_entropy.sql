-- ═══ المهمّة ٩ — رمز التملّك: ٤٠ بتًا كاملة بدل ٣٩ ═══
--
-- العطل: المولّد كان يشتقّ بايتاته من هيكس gen_random_uuid()، ويأخذ
-- الأزواج عند المواضع ١،٣،٥…١٥. والرقيم ١٣ من UUIDv4 هو رقم الإصدار
-- وقيمته '4' دائمًا — فالبايت السابع محصورٌ في 0x40..0x4F، ومقسومه على
-- ٣٢ يقع في النصف الأوّل من الأبجدية وحده. أي أربعة بتاتٍ لا خمسة،
-- فالمجموع ٣٩ بتًا لا ٤٠ — نصفُ فضاء المفاتيح.
--
-- وهذا قيسَ لا خُمِّن: ٣٠٠٠ توليدة على الإنتاج أعطت ٣٢ حرفًا مميّزًا في
-- كلّ موضعٍ إلّا السابع، فأعطى ١٦ (A..R).
--
-- الإصلاح: gen_random_bytes(8) من pgcrypto — بايتٌ معمًّى لكلّ حرف،
-- و256 % 32 = 0 فالقسمة بلا انحياز.
--
-- سلامة التغيير: المستدعي الوحيد admin_create_restaurant، ولا رمز
-- تملّكٍ حيٍّ في القاعدة الآن (restaurants with claim_code not null = 0)
-- فلا رمزَ قائمٌ يُبطَل بهذا التغيير.
--
-- التراجع: 0185_ROLLBACK_gen_claim_code.sql

create or replace function public.gen_claim_code()
returns text language plpgsql set search_path to '' as $function$
declare
    alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    code text;
    b bytea;
    i int;
begin
    loop
        code := '';
        b := extensions.gen_random_bytes(8);
        for i in 1..8 loop
            code := code || substr(alphabet, 1 + (get_byte(b, i - 1) % 32), 1);
        end loop;
        exit when not exists (select 1 from public.restaurants where claim_code = code);
    end loop;
    return code;
end $function$;

-- حارسٌ دائم w52: لا عودةَ لاشتقاق الرمز من هيكس UUID
do $mig$
declare d text; d2 text; v_new text;
begin
  select pg_get_functiondef(oid) into d
    from pg_proc where proname='run_critical_checks' and pronamespace='public'::regnamespace;
  v_new :=
       E'    (''w52_claim_code_full_entropy'',\n'
    || E'       (select pg_get_functiondef(oid) ~ ''gen_random_bytes''\n'
    || E'           and pg_get_functiondef(oid) !~ ''gen_random_uuid''\n'
    || E'          from pg_proc where proname=''gen_claim_code''\n'
    || E'           and pronamespace=''public''::regnamespace)),\n';
  d2 := replace(d, E'    (''q20_schema_no_drift'',', v_new || E'    (''q20_schema_no_drift'',');
  if d2 = d then raise exception 'مرساة q20 لم تُطابق'; end if;
  execute d2;
end
$mig$;

-- تحقّقٌ بعديّ: الحارس أُضيف وأخضر، ولا فحصَ سقط
do $verify$
declare v_fail text; v_w52 boolean;
begin
  select coalesce(string_agg(name,'، ') filter (where not pass),'—') into v_fail
    from public.run_critical_checks();
  select pass into v_w52 from public.run_critical_checks() where name='w52_claim_code_full_entropy';
  if v_w52 is null then raise exception 'w52 لم يُضف'; end if;
  if not v_w52 then raise exception 'w52 راسب فور إضافته'; end if;
  if v_fail <> '—' then raise exception 'فحوصٌ راسبة: %', v_fail; end if;
end
$verify$;