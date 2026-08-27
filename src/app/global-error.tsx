"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * آخر شبكة أمان: انهيارٌ في التخطيط الجذري نفسه.
 *
 * هذه الحالة لا تلتقطها أي حدود خطأٍ أخرى — الصفحة تسقط كاملةً قبل أن يعمل
 * شيء من واجهتنا. ولأنها تستبدل الجذر، يجب أن تحمل <html> و<body> بنفسها.
 *
 * والزبون هنا في أسوأ لحظة: شاشة بيضاء وهو واقف على باب المطعم. فالمعروض
 * عربيّ صريح ومعه مخرجان: إعادة المحاولة، والعودة للرئيسية.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
    // وبلاغٌ لمنصّتنا أيضًا: هذا يصل تيليجرام المشغّل خلال ٥ دقائق عبر
    // الفحص الدوري — Sentry يجمع التفاصيل ولا ينبّه أحدًا عندنا بعد.
    try {
      fetch("/api/client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: window.location.pathname, message: error?.message ?? "root-crash" }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* الإبلاغ لا يكسر آخر شبكة أمان */
    }
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#faf7f2", color: "#2b1a12" }}>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center" }}>
          <span style={{ display: "flex", height: 64, width: 64, alignItems: "center", justifyContent: "center", borderRadius: "50%", background: "#781e0c", color: "#fff", fontSize: 30 }}>!</span>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>تعذّر عرض الصفحة</h1>
          <p style={{ fontSize: 14, opacity: 0.75, margin: 0, maxWidth: 340, lineHeight: 1.7 }}>
            وصلنا تنبيهٌ بالمشكلة ونعمل عليها. دورك في الطابور لم يضِع — جرّب إعادة التحميل.
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{ borderRadius: 16, border: "none", background: "#781e0c", color: "#fff", padding: "12px 22px", fontSize: 14, fontWeight: 800, cursor: "pointer" }}
            >
              إعادة المحاولة
            </button>
            {/* رابط عاديّ لا <Link/> عن قصد: هذه الشاشة تظهر حين ينهار التخطيط
                الجذري، وموجّه Next قد يكون جزءًا ممّا انهار — فالتنقّل داخله
                يعيد الانهيار نفسه. التحميل الكامل هو المخرج الوحيد المضمون. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{ borderRadius: 16, border: "1px solid rgba(120,30,12,0.25)", padding: "12px 22px", fontSize: 14, fontWeight: 700, color: "#2b1a12", textDecoration: "none" }}
            >
              الرئيسية
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
