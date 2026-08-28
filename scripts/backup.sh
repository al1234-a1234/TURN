#!/usr/bin/env bash
# ============================================================================
#  نسخة احتياطية كاملة لقاعدة «دور» — تُشغَّل من جهازك، لا من أي خدمة.
#
#  الغاية: ألّا يبقى المشروع رهينة أي مزوّد. هذا الملف + supabase/migrations
#  يكفيان لإعادة بناء كل شيء على أي Postgres في العالم (اقرأ docs/RESTORE.md).
#
#  الاستخدام:
#      export SUPABASE_DB_URL='postgresql://postgres.<ref>:<كلمة السر>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres'
#      ./scripts/backup.sh              # إلى ./backups
#      ./scripts/backup.sh /mnt/usb     # أو إلى مجلّد تختاره
#
#  الرابط من: Supabase → Project Settings → Database → Connection string → URI.
#  لا تكتبه في أي ملف داخل المستودع — المستودع عامّ.
# ============================================================================
set -Eeuo pipefail

OUT_ROOT="${1:-./backups}"
STAMP="$(date -u +%Y%m%d-%H%M%SZ)"
OUT="$OUT_ROOT/$STAMP"

die() { printf '\n✗ %s\n' "$1" >&2; exit 1; }

[ -n "${SUPABASE_DB_URL:-}" ] || die "اضبط SUPABASE_DB_URL أولًا (انظر الترويسة أعلاه)."
command -v pg_dump >/dev/null || die "pg_dump غير مثبَّت. ثبّت postgresql-client."
command -v psql    >/dev/null || die "psql غير مثبَّت. ثبّت postgresql-client."

# إصدار العميل يجب أن يساوي إصدار الخادم أو يزيد، وإلا رفض pg_dump العمل.
SERVER_MAJOR="$(psql "$SUPABASE_DB_URL" -Atc 'show server_version_num' | cut -c1-2)"
CLIENT_MAJOR="$(pg_dump --version | grep -oE '[0-9]+' | head -1)"
if [ "$CLIENT_MAJOR" -lt "$SERVER_MAJOR" ]; then
  die "pg_dump $CLIENT_MAJOR أقدم من الخادم $SERVER_MAJOR — ثبّت postgresql-client-$SERVER_MAJOR."
fi

mkdir -p "$OUT"
echo "▸ الوجهة: $OUT"

# ١) البنية: جداول، دوال، سياسات RLS، فهارس، تريغرات — بلا بيانات.
echo "▸ البنية…"
pg_dump "$SUPABASE_DB_URL" --schema-only --no-owner --no-privileges \
  --schema=public --schema=auth \
  > "$OUT/01-schema.sql"

# ٢) البيانات: العملاء، الطوابير، الحجوزات، القوائم… (public وحده)
echo "▸ البيانات…"
pg_dump "$SUPABASE_DB_URL" --data-only --no-owner --no-privileges \
  --schema=public --disable-triggers \
  > "$OUT/02-data-public.sql"

# ٣) الحسابات: بلا auth.users لا يستطيع أي موظّف تسجيل الدخول بعد الاسترجاع.
#    كلمات السرّ مُعمّاة (bcrypt) داخل الجدول — الملف سرّي، خزّنه مشفَّرًا.
echo "▸ حسابات الدخول…"
pg_dump "$SUPABASE_DB_URL" --data-only --no-owner --no-privileges \
  --table=auth.users --table=auth.identities \
  > "$OUT/03-data-auth.sql"

# ٤) جرد: كم صفًّا في كل جدول — يكشف نسخة فارغة قبل أن تحتاجها.
# ══ المتطلّبات المسبقة — تُحمَّل قبل البنية ══
# لماذا؟ النسخة تأخذ public و auth فقط، وأعمدة المفاتيح تعتمد على
# `extensions.uuid_generate_v4()`. فبلا الامتداد، كل جدولٍ مفتاحه uuid
# يفشل إنشاؤه — وهي قلب المنتج: المطاعم والفروع والعملاء والطابور
# والحجوزات. جرّبتُ الاسترجاع فعلًا فسقطت عشرة جداول ونجحت الأطراف،
# والنتيجة نسخةٌ تبدو سليمة وتُرجع لك مطعمًا بلا مطاعم.
#
# وقيود الحجز تستعمل btree_gist (منع تداخل المواعيد على الطاولة نفسها)،
# فغيابه يُسقط جدول الحجوزات وحده بلا رسالةٍ مفهومة.
#
# والأدوار تُنشأ فارغة: سياسات RLS تشير إليها بالاسم، ونسخةٌ تُسترجَع
# بلا سياساتها تُفتح للعالم.
echo "▸ المتطلّبات المسبقة…"
{
  echo "-- متطلّبات ما قبل الاسترجاع — حمّلها أولًا (انظر docs/RESTORE.md)"
  echo "create schema if not exists extensions;"
  echo "create schema if not exists auth;"
  psql "$SUPABASE_DB_URL" -At -c "
    select format('create extension if not exists %I with schema %I;', extname, nspname)
      from pg_extension e join pg_namespace n on n.oid = e.extnamespace
     where n.nspname = 'extensions' and extname <> 'pg_stat_statements'
     order by extname;"
  cat <<'ROLES'
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated','service_role','authenticator',
                           'supabase_admin','supabase_auth_admin','supabase_storage_admin',
                           'dashboard_user','pgbouncer','supabase_read_only_user']
  loop
    begin execute format('create role %I nologin', r);
    exception when duplicate_object then null; end;
  end loop;
end $$;
ROLES
} > "$OUT/00-prereqs.sql"

echo "▸ الجرد…"
# عدد فعليّ لا تقديرٌ إحصائيّ: n_live_tup (المُستخدَم سابقًا) قيمةٌ يحدّثها
# autovacuum دوريًّا فقط، وتنحرف بشدّة عن الواقع في جدولٍ سريع التقلّب مثل
# waitlist_entries (يُدرَج ويُحذَف باستمرار مع دخول العملاء وجلوسهم وإلغائهم).
# هذا الانحراف أسقط تحقّق الاسترجاع فعليًّا (رأى العدّاد ٣٢٠ والنسخة ٨٨ —
# النسخة كانت صحيحة، والعدّاد كان تقديرًا قديمًا). count(*) هنا حقيقيّ.
psql "$SUPABASE_DB_URL" -At -F',' -o "$OUT/04-rowcounts.csv" <<'SQL'
select c.relname,
       (xpath('/row/c/text()',
              query_to_xml(format('select count(*) as c from public.%I', c.relname), false, true, '')
             ))[1]::text::bigint as cnt
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
 order by cnt desc;
SQL

for f in 00-prereqs.sql 01-schema.sql 02-data-public.sql 03-data-auth.sql; do
  [ -s "$OUT/$f" ] || die "$f خرج فارغًا — النسخة غير صالحة."
done

gzip -9 "$OUT"/*.sql
SUM_FILE="$OUT/SHA256SUMS"
( cd "$OUT" && sha256sum ./* > "$(basename "$SUM_FILE")" ) || true

TOTAL_ROWS="$(awk -F',' '{s+=$2} END {print s+0}' "$OUT/04-rowcounts.csv")"
cat > "$OUT/README.txt" <<EOF
نسخة «دور» الاحتياطية — $STAMP (UTC)
مجموع الصفوف في public: $TOTAL_ROWS

الاسترجاع: اقرأ docs/RESTORE.md في المستودع.
ترتيب التطبيق: 01-schema ← 02-data-public ← 03-data-auth.

تحذير: 03-data-auth.sql.gz يحوي بيانات حسابات الدخول. احفظه مشفَّرًا
(مثلًا: gpg -c) ولا ترفعه إلى أي مستودع أو تخزين عامّ.
EOF

echo
echo "✓ تمّت النسخة: $OUT"
echo "  مجموع الصفوف: $TOTAL_ROWS"
du -sh "$OUT"
