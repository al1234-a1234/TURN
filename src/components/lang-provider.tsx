"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Lang } from "@/lib/i18n";

const LangContext = createContext<Lang>("ar");

/**
 * لغة الواجهة — تُقرأ من الكوكي في المتصفّح لا على الخادم.
 *
 * لماذا؟ قراءتها في الغلاف الجذري كانت تُجبر **كل صفحة في التطبيق** على
 * التوليد من الصفر لكل زائر، فلا تُخزَّن صفحة واحدة على الحافة. والثمن
 * فراغٌ يراه العميل قبل ظهور المحتوى — في تطبيق طابور يقف فيه الناس.
 *
 * والبدء بالعربية مقصود مرّتين: هي لغة المنتج الأولى، وهي ما يضمن تطابق
 * أوّل رسم بين الخادم والعميل (لو قرأنا الكوكي أثناء الرسم الأوّل لانهار
 * التركيب). فالعربيّ — وهو جمهور المنتج — يرى صفحته جاهزة من الحافة،
 * والإنجليزيّ يرى إطارًا واحدًا بالعربية ثم تنقلب. هذا ثمن الصفقة كلّه.
 */
export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>("ar");

  useEffect(() => {
    const c = /(?:^|;\s*)lang=(en|ar)/.exec(document.cookie)?.[1] as Lang | undefined;
    if (c !== "en") return;
    setLang("en");
    // الغلاف يصل من الحافة بالعربية، فتُصحَّح سمتا الوثيقة هنا — عليهما
    // تعتمد أدوات Tailwind الاتجاهية وقارئاتُ الشاشة.
    document.documentElement.lang = "en";
    document.documentElement.dir = "ltr";
  }, []);

  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

/** لغة الواجهة الحالية داخل مكوّنات العميل. */
export function useLang(): Lang {
  return useContext(LangContext);
}
