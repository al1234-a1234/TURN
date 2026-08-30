"use client";

import { useEffect, useState } from "react";
import { tr, type Lang } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";
import { guideMode, guideSeenKey, hasZoneChoice, shouldAutoOpen, type GuideBranch } from "@/lib/guide-mode";

/**
 * دليل العميل — غطاءٌ سفليّ يظهر مرّةً واحدةً لكلّ مطعم.
 *
 * ── القيود التي بُني عليها، وكلّها من أمر المالك ──
 * ١) صفر تغيير على أيّ مكوّنٍ أو تصميمٍ قائم. فهذا الملفّ **جديدٌ بالكامل**،
 *    ولم يُلمس النموذج ولا منطقه. والوحيد الذي مُسّ خارجه سطرُ تركيبٍ واحد
 *    في `page.tsx`.
 * ٢) توكنات التصميم الفعليّة حرفيًّا: `rq-btn` · `--surface` · `--ink` ·
 *    `--muted` · `--brand-solid` · `--brand-d` · `--brand-ink` · `cream-100`،
 *    و`rgba(102,28,10,…)` بنفس درجاتها المستعملة في الصفحة. ولا لون جديد ولا
 *    صنفٌ موازٍ. وهيكلُ الغطاء منسوخٌ من غطاء الموقع القائم في
 *    `waitlist-form` (نفس `rounded-t-[30px]`، ونفس المقبض، ونفس `black/45`)
 *    كي يبدو للعميل امتدادًا لما رآه لا شاشةً غريبة.
 * ٣) ثلاثة أسطر لا أكثر، وزرّ إغلاقٍ كبير: العميل واقفٌ في المطعم ويريد أن
 *    يخلّص بثوانٍ. فالتنبيهات مطويّةٌ افتراضيًّا — من احتاجها فتحها.
 *
 * ٤) تحديثٌ لاحق: المالك طلب شرحًا مبسّطًا لا مختصرًا — فصار لكلّ خطوةٍ سطرُ
 *    عنوانٍ وسطرُ تفصيلٍ واحد («ماذا يحدث بعدها؟»)، وضمن ذلك توضيحٌ صريح أنّ
 *    تسجيلًا واحدًا يكفي المجموعة كاملة. يبقى الغطاء ثلاث خطواتٍ كحدٍّ أقصى
 *    ويُقرأ في ثوانٍ — لا صفحة.
 */
export function GuideSheet({ slug, branches }: { slug: string; branches: readonly GuideBranch[] }) {
  const lang = useLang();
  const [open, setOpen] = useState(false);
  /**
   * قبل قراءة التخزين لا نرسم شيئًا — لا الغطاء ولا زرّ «؟».
   * الرسمُ قبل المعرفة يُنتج وميضًا: غطاءٌ يظهر ثمّ يختفي لمن رآه أمس.
   */
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // القرار نفسه (هل نفتح؟) نقيٌّ ومختبَرٌ في shouldAutoOpen — هنا فقط
    // القراءة الفعلية من التخزين، وهي وحدها ما يحتاج متصفّحًا حقيقيًّا.
    let autoOpen = false;
    try {
      autoOpen = shouldAutoOpen(window.localStorage.getItem(guideSeenKey(slug)));
    } catch {
      // تصفّحٌ خاصّ أو تخزينٌ محجوب: نعتبره «رآه» فلا نُلحّ على من لا نستطيع
      // أن نتذكّر له شيئًا — غطاءٌ يظهر في كلّ زيارة أسوأ من غطاءٍ لا يظهر.
      autoOpen = false;
    }
    setOpen(autoOpen);
    setReady(true);
  }, [slug]);

  const close = () => {
    setOpen(false);
    try {
      window.localStorage.setItem(guideSeenKey(slug), "1");
    } catch {
      /* لا يمنع الإغلاق */
    }
  };

  if (!ready) return null;

  return open ? (
    <Sheet lang={lang} branches={branches} onClose={close} />
  ) : (
    /* زرّ العودة — يُرجع الغطاء بلا إعادة تحميل. صغيرٌ وثابتٌ أسفل البداية
       كي لا يزاحم زرّ «خذ دورك الآن» أسفل اليمين في الشاشات الصغيرة. */
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={tr(lang, "كيف يعمل؟", "How it works")}
      className="fixed bottom-5 start-4 z-40 flex h-11 w-11 items-center justify-center rounded-full text-lg font-bold text-cream-100 shadow-lg"
      style={{ background: "var(--brand-solid)" }}
    >
      ؟
    </button>
  );
}

function Sheet({
  lang,
  branches,
  onClose,
}: {
  lang: Lang;
  branches: readonly GuideBranch[];
  onClose: () => void;
}) {
  const mode = guideMode(branches);
  const [alerts, setAlerts] = useState(false);
  const [os, setOs] = useState<"android" | "ios">("android");

  // يفتح على تبويب جهازه: خطوات آيفون أطول، ومن يفتحها ويجد خطوات أندرويد
  // يظنّها كلّ ما هناك فيغلق.
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const ua = navigator.userAgent || "";
    const apple = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    if (apple) setOs("ios");
  }, []);

  // خطوة القسم مشروطة: تظهر فقط حين يوجد اختيارٌ فعليّ ليُختار. وفرعٌ بقسمٍ
  // واحد لا يعرض على العميل أزرار أقسامٍ أصلًا، فتُحذف الخطوة كاملةً بدل أن
  // تظهر فارغة — والترقيم يُعاد تسلسله تلقائيًّا لأنّه مشتقٌّ من الفهرس.
  const zoneStep = hasZoneChoice(branches)
    ? [
        {
          title: tr(lang, "اختر القسم", "Choose the area"),
          detail: tr(
            lang,
            "لو الفرع قسم واحد بس، تُحذف هذه الخطوة تلقائيًا، لا تظهر فارغة.",
            "If a branch has only one area, this step is removed automatically — it never shows up empty.",
          ),
        },
      ]
    : [];

  // كلّ خطوة: عنوانها، وسطرٌ واحدٌ يقول ماذا يحدث بعدها. والخطوات نفسها حدّدها
  // المالك حرفيًّا لوضع الانتظار، ووضعُ الحجز يتبع نفس المنطق: عدد، ثمّ قسمٌ
  // إن وُجد اختيار، ثمّ التسجيل الذي يحمل معه ما يحدث بعده.
  const steps: { title: string; detail?: string }[] =
    mode === "waitlist"
      ? [
          {
            title: tr(lang, "حدّد عدد أفراد مجموعتك", "Choose your party size"),
            detail: tr(
              lang,
              "شخص واحد فقط يسجّل عن المجموعة كاملة، ما يحتاج كل فرد يسجّل لحاله.",
              "Only one person registers for the whole group — no need for everyone to sign up.",
            ),
          },
          ...zoneStep,
          {
            title: tr(lang, "اكتب اسمك ورقم جوالك وانضم", "Enter your name and mobile, then join"),
            detail: tr(
              lang,
              "دورك يتحدّث تلقائيًا، وتقدر تفعّل تنبيهات جوالك من الأسفل.",
              "Your turn updates automatically, and you can switch on phone alerts below.",
            ),
          },
        ]
      : mode === "reservations"
        ? [
            {
              title: tr(lang, "اختر عدد الأشخاص", "Choose your party size"),
              detail: tr(
                lang,
                "العدد يشمل مجموعتك كاملة — شخص واحد يكفي المجموعة، ما يحتاج كل فرد يسجّل لحاله.",
                "The number covers your whole group — one person is enough, no need for everyone to sign up.",
              ),
            },
            ...zoneStep,
            {
              title: tr(lang, "اكتب اسمك ورقم جوالك واحجز", "Enter your name and mobile, then book"),
              detail: tr(
                lang,
                "حجزك يتحدّث تلقائيًا، وتقدر تفعّل تنبيهات جوالك من الأسفل.",
                "Your booking updates automatically, and you can switch on phone alerts below.",
              ),
            },
          ]
        : [
            {
              title: tr(lang, "هذا المطعم يستقبل مباشرةً", "This restaurant is walk-in"),
              detail: tr(lang, "ادخل بلا دورٍ ولا حجز.", "Just come in — no turn, no booking."),
            },
          ];

  return (
    <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal>
      <button
        type="button"
        aria-label={tr(lang, "إغلاق", "Close")}
        className="absolute inset-0 cursor-default bg-black/45"
        onClick={onClose}
      />
      <div className="relative max-h-[88vh] w-full overflow-y-auto rounded-t-[30px] bg-[color:var(--surface)] px-6 pb-8 pt-3 shadow-2xl">
        <span className="mx-auto mb-5 block h-1 w-11 rounded-full bg-[rgba(102,28,10,0.18)]" />

        <p className="text-lg font-bold text-[color:var(--ink)]">
          {tr(lang, "كيف يعمل؟", "How it works")}
        </p>

        <ol className="mt-3 space-y-3">
          {steps.map((s, i) => (
            <li key={s.title} className="flex items-start gap-3">
              {steps.length > 1 && (
                <span
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-cream-100"
                  style={{ background: "var(--brand-solid)" }}
                >
                  {i + 1}
                </span>
              )}
              <span className="flex flex-col">
                <span className="text-sm font-semibold text-[color:var(--ink)]">{s.title}</span>
                {s.detail && (
                  <span className="text-xs font-medium text-[color:var(--muted)]">{s.detail}</span>
                )}
              </span>
            </li>
          ))}
        </ol>

        {/* التنبيهات — مطويّةٌ افتراضيًّا: أطولُ جزءٍ وأقلُّه إلحاحًا */}
        <button
          type="button"
          onClick={() => setAlerts((v) => !v)}
          aria-expanded={alerts}
          className="mt-5 flex w-full items-center justify-between rounded-2xl px-4 py-3 text-sm font-bold text-[color:var(--brand-d)]"
          style={{ background: "rgba(102,28,10,0.06)" }}
        >
          <span>{tr(lang, "تنبيهات دورك على جوّالك", "Alerts on your phone")}</span>
          <span aria-hidden>{alerts ? "▴" : "▾"}</span>
        </button>

        {alerts && (
          <div className="mt-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOs("android")}
                className="flex-1 rounded-xl px-3 py-2 text-xs font-bold"
                style={
                  os === "android"
                    ? { background: "var(--brand-solid)", color: "var(--brand-ink)" }
                    : { background: "rgba(102,28,10,0.06)", color: "var(--brand-d)" }
                }
              >
                {tr(lang, "أندرويد", "Android")}
              </button>
              <button
                type="button"
                onClick={() => setOs("ios")}
                className="flex-1 rounded-xl px-3 py-2 text-xs font-bold"
                style={
                  os === "ios"
                    ? { background: "var(--brand-solid)", color: "var(--brand-ink)" }
                    : { background: "rgba(102,28,10,0.06)", color: "var(--brand-d)" }
                }
              >
                {tr(lang, "آيفون", "iPhone")}
              </button>
            </div>

            <ol className="mt-3 space-y-1.5 text-sm font-medium text-[color:var(--muted)]">
              {(os === "android"
                ? [tr(lang, "اسمح بالإشعارات حين يُطلب — بلا تثبيت.", "Allow notifications when asked — no install needed.")]
                : [
                    tr(lang, "اضغط زرّ المشاركة في سفاري.", "Tap the Share button in Safari."),
                    tr(lang, "اختر «إضافة إلى الشاشة الرئيسية».", "Choose “Add to Home Screen”."),
                    tr(lang, "افتح الموقع من الأيقونة ثمّ فعّل الإذن.", "Open it from the icon, then allow alerts."),
                  ]
              ).map((s) => (
                <li key={s}>• {s}</li>
              ))}
            </ol>
          </div>
        )}

        <button type="button" onClick={onClose} className="rq-btn mt-6">
          {tr(lang, "فهمت — ابدأ", "Got it — start")}
        </button>
      </div>
    </div>
  );
}
