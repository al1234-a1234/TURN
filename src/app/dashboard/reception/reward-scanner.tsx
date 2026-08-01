"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconCamera } from "@/components/icons";
import jsQR from "jsqr";
import { extractRewardCode } from "@/lib/reward-code";
import { tr, type Lang } from "@/lib/i18n";

/**
 * ماسح الكاميرا عند الكاشير — النصف الثاني من الحلقة:
 * جوّال/آيباد الاستقبال يمسح باركود هدية العميل فيُبحث عنها فورًا،
 * بلا إملاء رمز ولا كتابة. المسارات:
 *   ١) BarcodeDetector الأصلي (كروم/أندرويد) — أسرع وأخفّ.
 *   ٢) jsQR على إطارات الكانفس (سفاري/آيباد) — لا يملك الواجهة الأصلية.
 * وتعطّل الكاميرا (رفض إذن/غيابها) لا يكسر شيئًا: الرمز السداسي يبقى
 * طريق الاحتياط في نفس الصندوق.
 *
 * الحمولة المقبولة: `EIGHT:R:<code>` (أو TURN القديمة) أو الرمز مجرّدًا — أي شيء آخر يُتجاهل
 * بصمت (ملصق منتج، رابط موقع…) ويستمر المسح بدل أن يفشل البحث.
 */

type NativeDetector = { detect: (src: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };

export function RewardScanner({ lang, onCode }: { lang: Lang; onCode: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const doneRef = useRef(false);
  // مرجع ثابت للنداء: الأب يعيد الريندر كل نبضة تحديث (١٠ث) فتتغيّر هوية
  // onCode ويُعاد تشغيل تأثير الكاميرا — كانت الكاميرا تنطفئ وتشتغل كل
  // ١٠ ثوانٍ في وجه المستخدم وتبدو «ما تضبط».
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setOpen(false);
  }, []);

  // فتح الكاميرا وبدء حلقة الفكّ
  useEffect(() => {
    if (!open) return;
    doneRef.current = false;
    let alive = true;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (!alive) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const Detector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => NativeDetector }).BarcodeDetector;
        const native = Detector ? new Detector({ formats: ["qr_code"] }) : null;
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        const found = (raw: string) => {
          const code = extractRewardCode(raw);
          if (!code || doneRef.current) return;
          doneRef.current = true;
          try { navigator.vibrate?.(80); } catch { /* تجاهُل */ }
          onCodeRef.current(code);
          stop();
        };

        // بلا هذا الحارس كانت rAF تكدّس عشرات نداءات detect المتوازية
        // (كلٌّ منها async) فتختنق بعض أجهزة أندرويد ويتجمّد الفكّ.
        let busy = false;
        const tick = async () => {
          if (!alive || doneRef.current) return;
          if (video.readyState >= 2 && !busy) {
            busy = true;
            if (native) {
              try {
                const hits = await native.detect(video);
                for (const h of hits) found(h.rawValue);
              } catch { /* إطار فاسد — نكمل */ }
            } else if (ctx) {
              // سفاري: فكّ يدوي عبر jsQR — دقة متوسطة توازن الالتقاط والأداء
              const w = 640;
              const h = Math.round((video.videoHeight / video.videoWidth) * w) || 480;
              canvas.width = w; canvas.height = h;
              ctx.drawImage(video, 0, 0, w, h);
              const img = ctx.getImageData(0, 0, w, h);
              // attemptBoth: شاشة عميل بالوضع الليلي تعرض الباركود معكوسًا
              const hit = jsQR(img.data, w, h, { inversionAttempts: "attemptBoth" });
              if (hit?.data) found(hit.data);
            }
            busy = false;
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        if (alive) {
          setError(tr(lang, "تعذّر فتح الكاميرا — اكتب الرمز يدويًّا.", "Camera unavailable — type the code instead."));
          setOpen(false);
        }
      }
    })();

    return () => { alive = false; cancelAnimationFrame(rafRef.current); streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };
  }, [open, lang, stop]);

  if (!open) {
    return (
      <div className="shrink-0">
        <button
          type="button"
          onClick={() => { setError(null); setOpen(true); }}
          className="btn btn-primary flex items-center gap-1.5 px-4"
          title={tr(lang, "امسح باركود الهدية", "Scan gift barcode")}
        >
          <IconCamera size={17} /> {tr(lang, "امسح", "Scan")}
        </button>
        {error && <p className="mt-1 max-w-[160px] text-[10px] font-bold" style={{ color: "var(--danger)" }}>{error}</p>}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 p-6" onClick={stop}>
      <div className="relative w-full max-w-sm overflow-hidden rounded-3xl" onClick={(e) => e.stopPropagation()}>
        {/* muted + playsInline: شرط سفاري للتشغيل بلا إيماءة إضافية */}
        <video ref={videoRef} muted playsInline className="h-72 w-full object-cover" />
        {/* إطار التصويب */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-44 w-44 rounded-2xl border-4 border-white/80" style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)" }} />
        </div>
      </div>
      <p className="mt-4 text-center text-sm font-bold text-cream-100/90">
        {tr(lang, "وجّه الكاميرا على باركود هدية العميل", "Point the camera at the customer's gift barcode")}
      </p>
      <button type="button" onClick={stop} className="mt-3 rounded-xl bg-white/15 px-5 py-2 text-sm font-extrabold text-cream-100 ring-1 ring-white/30">
        {tr(lang, "إغلاق", "Close")}
      </button>
    </div>
  );
}
