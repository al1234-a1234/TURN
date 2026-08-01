"use client";

import Link from "next/link";
import { Logo } from "@/components/logo";

/* أي انهيار وقت التشغيل كان يعرض شاشة Next الافتراضية (إنجليزية، بلا هوية،
   بلا مخرج). هذي تمسك الخطأ، تعرض رسالة مطمئنة بهويتنا، وتعطي زر إعادة
   محاولة — الطابور بيانات حيّة وإعادة المحاولة غالبًا تكفي. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-6 text-center">
      <span className="flex h-20 w-20 items-center justify-center rounded-3xl" style={{ background: "var(--brand-solid)" }}>
        <Logo size={96} />
      </span>
      <h1 className="mt-6 font-display text-2xl font-bold text-[color:var(--ink)]">صار خلل مؤقت</h1>
      <p className="mt-2 max-w-sm text-sm leading-6 text-[color:var(--muted)]">
        ما ضاع شيء من بياناتك. جرّب مرة ثانية، ولو تكررت المشكلة انتظر دقيقة ثم أعد فتح الصفحة.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <button onClick={reset} className="rq-btn !w-auto px-8">
          إعادة المحاولة
        </button>
        <Link href="/" className="rq-btn-soft !w-auto px-8">
          الرئيسية
        </Link>
      </div>
    </div>
  );
}
