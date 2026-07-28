"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { rewardPayload } from "@/lib/reward-code";

/**
 * باركود الهدية عند العميل — نصفه الأول من حلقة «ماك»:
 * العميل يعرض، الكاشير يمسح بالكاميرا، ولو تعطّلت الكاميرا يبقى الرمز
 * السداسي مقروءًا تحته فيُكتب يدويًّا. الحمولة `TURN:R:<code>` كي يرفض
 * الماسح أي باركود غريب (رابط موقع، ملصق منتج…) بدل أن يبحث به عبثًا.
 */
export function RewardQr({ code, size = 168 }: { code: string; size?: number }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    QRCode.toString(rewardPayload(code), {
      type: "svg",
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#661c0a", light: "#00000000" },
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
