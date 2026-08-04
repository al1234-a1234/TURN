"use client";

/**
 * «اللمحة» — حيلة الفوريّة المستعارة من التطبيقات المثبَّتة:
 * لحظة الضغط على بطاقة مطعم، الجهاز يملك أصلًا اسمه وشعاره وعدد طابوره
 * (معروضةً في البطاقة نفسها). تُحفظ هنا، فيعرضها هيكل التحميل فورًا بدل
 * الصناديق الرمادية، ريثما يصل الجواب الحيّ فيصحّح بصمت.
 *
 * ليست مصدر حقيقة: عمرها خمس دقائق، وتُستبدل دائمًا بما يقوله الخادم.
 */
export type Peek = {
  name: string;
  logo: string | null;
  waiting?: number;
  closed?: boolean;
  ts: number;
};

const TTL_MS = 5 * 60_000;

export function storePeek(slug: string, p: Omit<Peek, "ts">) {
  try {
    sessionStorage.setItem(`peek:${slug}`, JSON.stringify({ ...p, ts: Date.now() }));
  } catch {
    /* وضع خاص أو تخزين ممتلئ — اللمحة كماليّة، لا تكسر الضغطة */
  }
}

export function readPeek(slug: string): Peek | null {
  try {
    const raw = sessionStorage.getItem(`peek:${slug}`);
    if (!raw) return null;
    const p = JSON.parse(raw) as Peek;
    if (!p?.name || Date.now() - p.ts > TTL_MS) return null;
    return p;
  } catch {
    return null;
  }
}
