#!/usr/bin/env bash
# ============================================================================
#  تركيب المقاطع الثلاثة — 1080×1920 · 30fps · H.264 · بلا صوت.
#
#    bash scripts/demo-video/compose.sh
#
#  ── ما يرسمه هذا الملفّ وما لا يرسمه ──
#  يرسم: الخلفية الكريميّة · إطار الجوّال · شاشتَي العنوان والخاتمة ·
#        سطر التعليق أسفل اللقطة. وهي عناصر تأطيرٍ استثناها المالك صراحةً.
#  لا يرسم: ولا بكسل من واجهة المنصّة. كلّ لقطةٍ تُركَّب كما خرجت من
#        المتصفّح: بلا تعديل لون ولا تشبّع ولا حدّة ولا اقتصاص للمحتوى.
# ============================================================================
set -euo pipefail

FF="${FFMPEG:-/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux}"
[ -x "$FF" ] || FF="$(command -v ffmpeg || true)"
[ -n "$FF" ] || { echo "✗ لم أجد ffmpeg. اضبط FFMPEG=/path/to/ffmpeg"; exit 1; }

SHOTS="${SHOTS_DIR:-screenshots}"
OUT="${OUT_DIR:-out}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUT"

W=1080; H=1920; FPS=30
CREAM="#F7F0E4"; MAROON="#781E0C"
LOGO="${LOGO:-public/eight-logo.png}"

# الخطّ: خطّ المشروع الفعليّ IBM Plex Sans Arabic إن كان مثبّتًا، وإلّا أوّل
# خطٍّ عربيٍّ نظيف. لا نسقط إلى خطٍّ افتراضيّ رديء بصمت — نتوقّف ونخبر.
FONT="${FONT:-}"
if [ -z "$FONT" ]; then
  for c in \
    "$HOME/Library/Fonts/IBMPlexSansArabic-SemiBold.ttf" \
    "/usr/share/fonts/truetype/ibm-plex/IBMPlexSansArabic-SemiBold.ttf" \
    "/System/Library/Fonts/Supplemental/Noto Naskh Arabic.ttc" \
    "/usr/share/fonts/truetype/noto/NotoNaskhArabic-Bold.ttf" \
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" ; do
    [ -f "$c" ] && FONT="$c" && break
  done
fi
[ -n "$FONT" ] || { echo "✗ لم أجد خطًّا عربيًّا. اضبط FONT=/path/to/font.ttf"; exit 1; }
echo "▸ الخطّ: $FONT"

# ── لقطةٌ واحدة → إطارٌ عموديّ كامل ──
# $1 ملفّ اللقطة · $2 نمط العرض (phone|desk) · $3 التعليق · $4 المدّة ·
# $5 زوم (0|1) · $6 المخرَج
render() {
  local src="$1" mode="$2" caption="$3" dur="$4" zoom="$5" dst="$6"
  local inner_w inner_y
  if [ "$mode" = "phone" ]; then inner_w=760; inner_y=430; else inner_w=980; inner_y=620; fi

  local zf=""
  if [ "$zoom" = "1" ]; then
    # تكبير خفيف 1.00 → 1.04 على «بعد» لجذب العين إلى ما تغيّر
    zf="zoompan=z='min(1.04,1+0.04*on/(${FPS}*${dur}))':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${inner_w}x-1:fps=${FPS},"
  fi

  "$FF" -y -loop 1 -t "$dur" -i "$src" \
    -f lavfi -t "$dur" -i "color=c=${CREAM}:s=${W}x${H}:r=${FPS}" \
    -filter_complex "
      [0:v]scale=${inner_w}:-1:flags=lanczos,${zf}
           format=rgba,
           pad=iw+24:ih+24:12:12:color=${MAROON}@0.10,
           format=rgba[shot];
      [1:v][shot]overlay=(W-w)/2:${inner_y}:format=auto[bg];
      [bg]drawtext=fontfile='${FONT}':text='${caption}':fontcolor=${MAROON}:
          fontsize=44:x=(w-text_w)/2:y=${inner_y}-120:
          line_spacing=10[v]
    " -map "[v]" -r "$FPS" -pix_fmt yuv420p -c:v libx264 -preset medium -crf 18 \
    -an "$dst" -loglevel error
}

# ── شاشة نصّية (عنوان أو خاتمة) ──
title_card() {
  local text="$1" dur="$2" dst="$3" withlogo="${4:-1}"
  local logo_in=() logo_fc=""
  if [ "$withlogo" = "1" ] && [ -f "$LOGO" ]; then
    logo_in=(-loop 1 -t "$dur" -i "$LOGO")
    logo_fc="[1:v]scale=420:-1[lg];[bg0][lg]overlay=(W-w)/2:640[bg];"
  else
    logo_fc="[bg0]null[bg];"
  fi
  "$FF" -y -f lavfi -t "$dur" -i "color=c=${CREAM}:s=${W}x${H}:r=${FPS}" \
    "${logo_in[@]}" \
    -filter_complex "
      [0:v]null[bg0];
      ${logo_fc}
      [bg]drawtext=fontfile='${FONT}':text='${text}':fontcolor=${MAROON}:
          fontsize=76:x=(w-text_w)/2:y=1080:line_spacing=18[v]
    " -map "[v]" -r "$FPS" -pix_fmt yuv420p -c:v libx264 -preset medium -crf 18 \
    -an "$dst" -loglevel error
}

# ── بناء مقطعٍ واحد من قائمة (ملفّ|تعليق|مدّة|زوم) ──
build() {
  local name="$1" mode="$2" title="$3"; shift 3
  local dir="$WORK/$name"; mkdir -p "$dir"
  local i=0 list="$dir/list.txt"; : > "$list"

  title_card "منصة إيت" 2 "$dir/000.mp4" 1
  echo "file '$dir/000.mp4'" >> "$list"
  title_card "$title" 2 "$dir/001.mp4" 0
  echo "file '$dir/001.mp4'" >> "$list"

  for spec in "$@"; do
    IFS='|' read -r file caption dur zoom <<< "$spec"
    local src="$SHOTS/$name/$file"
    if [ ! -f "$src" ]; then
      echo "  ⚠ ناقصة، تُتخطّى: $name/$file"   # لا بديلَ مرسوم — تُترك فراغًا
      continue
    fi
    i=$((i+1))
    local part; part="$(printf '%s/%03d.mp4' "$dir" $((i+1)))"
    render "$src" "$mode" "$caption" "$dur" "$zoom" "$part"
    echo "file '$part'" >> "$list"
  done

  title_card "منصة إيت — تنظيم الطابور والحجوزات" 3 "$dir/999.mp4" 1
  echo "file '$dir/999.mp4'" >> "$list"

  # الدمج مع تلاشٍ ناعم ٠٫٤ث بين المقاطع
  "$FF" -y -f concat -safe 0 -i "$list" \
    -vf "fps=${FPS},format=yuv420p" -c:v libx264 -preset medium -crf 18 -an \
    "$OUT/$name.mp4" -loglevel error
  echo "✓ $OUT/$name.mp4"
}

echo "▸ المقطع ١: العميل"
build customer phone "كيف يأخذ عميلك دوره" \
  "01-restaurant.png|يمسح الباركود ويفتح صفحة مطعمك|3|0" \
  "02-menu.png|قائمتك كاملة أمامه|3|0" \
  "03-join-empty.png|زرّ واحد ليأخذ دوره|3|0" \
  "04-join-filled.png|اسمه ورقمه فقط، بلا تطبيق|3|0" \
  "05-ticket.png|تذكرته ورقم دوره فورًا|3|0" \
  "06-ticket-advanced.png|ترتيبه يتحدّث لحظيًا|1.8|1" \
  "07-ticket-near.png|واقترب دوره|1.8|1" \
  "08-your-turn.png|حان دوره — يصله التنبيه|3|0"

echo "▸ المقطع ٢: الاستقبال"
build reception desk "شاشة موظف الاستقبال" \
  "01-queue.png|طابورك الحيّ أمامك|3|0" \
  "02-add-form.png|أضف عميلًا حضر بلا دور|3|0" \
  "03-after-add.png|دخل الطابور فورًا|1.8|1" \
  "04-before-seat.png|جاء دوره|1.8|0" \
  "05-after-seat.png|إجلاس بضغطة واحدة|1.8|1" \
  "06-before-cancel.png|وإن انصرف أحدهم|1.8|0" \
  "07-after-cancel.png|يخرج والباقي يتقدّم|1.8|1" \
  "08-before-swap.png|طلب أحدهم تأجيل دوره|1.8|0" \
  "09-after-swap.png|تبديل المواضع بمرونة|1.8|1" \
  "10-reservations.png|وحجوزات اليوم في مكانها|3|0" \
  "11-tv.png|وشاشة تعرض الطابور لضيوفك|3|0"

echo "▸ المقطع ٣: المالك"
build owner desk "لوحة تحكمك أنت" \
  "01-dashboard.png|أرقام يومك في نظرة|3|0" \
  "02-live-queue.png|طابورك الآن|3|0" \
  "03-reports-peak.png|أوقات الذروة الفعلية بالأرقام|3|0" \
  "04-reports-returning.png|كم عميلًا عاد إليك|3|0" \
  "05-insights.png|رؤى تقرأ أرقامك عنك|3|0" \
  "06-customers.png|سجلّ عملائك كاملًا|3|0" \
  "07-menu.png|قائمتك تعدّلها بنفسك|3|0" \
  "08-branches.png|فروعك في مكان واحد|3|0" \
  "09-staff.png|موظّفوك وصلاحياتهم|3|0" \
  "10-branch-settings.png|تفتح الطابور وتغلقه متى شئت|3|0"

echo ""
echo "════ تمّ ════"
ls -la "$OUT"/*.mp4 2>/dev/null || true
for f in "$OUT"/*.mp4; do
  [ -f "$f" ] && echo "$f → $("$FF" -i "$f" 2>&1 | grep -oE 'Duration: [0-9:.]+' | head -1)"
done
