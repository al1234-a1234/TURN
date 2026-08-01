"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { rewardPayload } from "@/lib/reward-code";

/**
 * باركود الهدية عند العميل — نصفه الأول من حلقة «ماك»:
 * العميل يعرض، الكاشير يمسح بالكاميرا، ولو تعطّلت الكاميرا يبقى الرمز
 * السداسي مقروءًا تحته فيُكتب يدويًّا. الحمولة `EIGHT:R:<code>` (والقراءة تقبل TURN القديمة) كي يرفض
 * الماسح أي باركود غريب (رابط موقع، ملصق منتج…) بدل أن يبحث به عبثًا.
 */
export function RewardQr({ code, size = 168 }: { code: string; size?: number }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // أسود صريح على أبيض مصمت — كان بلون الهوية البني على خلفية شفافة،
    // «أجمل» لكنه أضعف تباينًا فيرفض المسح على شاشات وإضاءات كثيرة.
    // الهوية مكانها حول الباركود لا داخله؛ داخل الباركود الوضوح ملك.
    QRCode.toString(rewardPayload(code), {
      type: "svg",
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "var(--surface)" },
    }).then((s) => { if (alive) setSvg(s); }).catch(() => {});
    return () => { alive = false; };
  }, [code]);

  if (!svg) return <div style={{ width: size, height: size }} className="mx-auto animate-pulse rounded-xl bg-[color:var(--surface-2)]" />;
  return (
    <div
      className="mx-auto"
      style={{ width: size, height: size }}
      // SVG مولَّد محليًّا من مكتبة qrcode بمدخل ثابت الشكل — ليس محتوى مستخدم
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
