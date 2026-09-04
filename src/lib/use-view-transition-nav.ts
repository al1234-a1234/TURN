"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

/**
 * تنقّلٌ بانتقالٍ بصريّ خفيف عبر View Transitions API الأصليّة بالمتصفّح —
 * لا مكوّن React التجريبيّ (`unstable_ViewTransition` كناري فقط، غير
 * موجود في حزمة `react@19.2.4` المثبّتة فعليًّا؛ تحقّقتُ من ذلك بفتح
 * الحزمة المنشورة على npm مباشرة قبل الكتابة).
 *
 * لماذا `useTransition` لا وعدٌ بعد `router.push` مباشرة: `router.push`
 * غير متزامن (يحتاج جلب حمولة RSC)، فوعدٌ يُحلّ فور استدعائه يلتقط المتصفّح
 * الصفحة القديمة كـ"بعد" أيضًا — انتقالٌ فارغ. `isPending` من React يبقى
 * `true` طوال الانتظار (هذا سلوك التوجيه في Next نفسه مع `startTransition`:
 * يُبقي المحتوى القديم ولا يُظهر هيكل `loading.tsx` إلا بعد مهلة) ويتحوّل
 * `false` فقط بعد أن يُثبّت المحتوى الحقيقي الجديد فعليًّا — فحلّ الوعد
 * عندها يلتقط المتصفّح الصفحة الجديدة الحقيقية لا الهيكل الرمادي.
 */
export function useViewTransitionNav() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const resolveRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isPending && resolveRef.current) {
      resolveRef.current();
      resolveRef.current = null;
    }
  }, [isPending]);

  return (href: string) => {
    // نوعٌ محليّ بدل تعديل واجهة Document العامّة — لا معرفة بإصدار مكتبة
    // DOM المثبّتة فعليًّا في CI مسبقًا، وهذا يتجنّب أي تعارض تصريحٍ محتمل.
    const doc = document as Document & {
      startViewTransition?: (callback: () => void | Promise<void>) => unknown;
    };
    // Safari <18 وFirefox القديم بلا الواجهة — تنقّلٌ عاديّ بلا كسر.
    if (typeof doc.startViewTransition !== "function") {
      router.push(href);
      return;
    }
    doc.startViewTransition(
      () =>
        new Promise<void>((resolve) => {
          resolveRef.current = resolve;
          startTransition(() => {
            router.push(href);
          });
        }),
    );
  };
}
