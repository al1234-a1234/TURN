-- ═══ تراجع ٠١٨٤ — يعيد مولّد رمز التملّك إلى نسخته السابقة حرفيًّا ═══
-- (بصمة النسخة المستعادة قبل ٠١٨٤ كانت مشتقّة من gen_random_uuid)
create or replace function public.gen_claim_code()
returns text language plpgsql set search_path to '' as $function$
declare
    alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    code text;
    raw  text;
    i int;
begin
    loop
        code := '';
        raw := replace(gen_random_uuid()::text, '-', '');
        for i in 1..8 loop
            code := code || substr(
              alphabet,
              1 + (('x' || substr(raw, i * 2 - 1, 2))::bit(8)::int % 32),
              1
            );
        end loop;
        exit when not exists (select 1 from public.restaurants where claim_code = code);
    end loop;
    return code;
end $function$;
