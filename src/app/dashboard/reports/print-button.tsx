"use client";

import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

export function PrintButton() {
  const lang = useLang();
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="btn btn-primary shrink-0"
    >
      🖨️ {tr(lang, "طباعة / حفظ PDF", "Print / Save PDF")}
    </button>
  );
}
