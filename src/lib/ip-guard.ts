import "server-only";
import { headers } from "next/headers";

/**
 * حدٌّ بعنوان الشبكة على المسارات الكاتبة — طبقةٌ ثانية لا أولى.
 *
 * الحدّ الحقيقي في القاعدة: ٣ انضمامات لكل رقم/١٠د، و٦٠٠ لكل فرع/دقيقة،
 * وسقفٌ صلبٌ ٣٠٠ صفًّا حيًّا لكل فرع. لكن كلّها تُقاس بالرقم أو بالفرع،
 * والمهاجم يملك أرقامًا بلا حدّ — ولا يملك عناوين شبكةٍ بلا حدّ.
 *
 * وهذا الحدّ في ذاكرة النسخة الواحدة لا في مخزنٍ مشترك: يوقف السكربت
 * الواحد الذي يضرب من جهازٍ واحد — وهو الشكل الغالب للتخريب — ولا يدّعي
 * أنه يوقف موزَّعًا. ولذلك لا يُعتمد عليه وحده، ولا يُبنى عليه قرار.
 *
 * ويفشل مفتوحًا دائمًا: خطأٌ في قراءة الترويسة أو في الحساب يعني «اسمح».
 * حبسُ عميلٍ واقفٍ على الباب بسبب عطبٍ في حارسٍ ثانويّ أسوأ من الثغرة.
 */
type Hit = { count: number; resetAt: number };

// الذاكرة تُمسح مع النسخة — وهذا مقبول: النافذة دقيقة واحدة أصلًا
const buckets = new Map<string, Hit>();
const MAX_KEYS = 5_000;

export async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    // ‏Vercel يضع أوّل عنوانٍ في السلسلة هو عنوان العميل الحقيقي
    const fwd = h.get("x-forwarded-for") ?? "";
    const first = fwd.split(",")[0]?.trim();
    return first || h.get("x-real-ip") || "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * يرجع true إن كان مسموحًا. `unknown` يمرّ دائمًا: عنوانٌ مجهول قد يكون
 * عميلًا خلف وكيلٍ لا مهاجمًا، ومنعُه عقابٌ على شبكته لا على فعله.
 */
export async function allowByIp(action: string, limit: number, windowMs: number): Promise<boolean> {
  try {
    const ip = await clientIp();
    if (ip === "unknown") return true;

    const now = Date.now();
    const key = `${action}:${ip}`;
    const cur = buckets.get(key);

    if (!cur || cur.resetAt <= now) {
      // تنظيفٌ كسول: لا مؤقّت يعمل في بيئةٍ بلا خادمٍ دائم
      if (buckets.size > MAX_KEYS) {
        for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
        if (buckets.size > MAX_KEYS) buckets.clear();
      }
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }

    cur.count += 1;
    return cur.count <= limit;
  } catch {
    return true;
  }
}
