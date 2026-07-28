/**
 * حمولة باركود الهدية: `TURN:R:<code>` — أو الرمز السداسي مجرّدًا (كتابة يدوية).
 * أي شيء آخر (رابط موقع، ملصق منتج…) يُرفض فيستمر الماسح بدل بحث عبثي.
 * الأبجدية مطابقة لمولّد القاعدة `gen_reward_code`: بلا 0/O/1/I الملتبسة.
 */

const PAYLOAD = /^TURN:R:([A-Z2-9]{4,12})$/i;
const BARE = /^[A-HJ-NP-Z2-9]{6}$/i;

export function extractRewardCode(raw: string): string | null {
  const t = (raw ?? "").trim();
  const m = PAYLOAD.exec(t);
  if (m) return m[1].toUpperCase();
  if (BARE.test(t)) return t.toUpperCase();
  return null;
}

/** حمولة باركود العميل — ما يُرمَّز في QR الهدية. */
export function rewardPayload(code: string): string {
  return `TURN:R:${code}`;
}
