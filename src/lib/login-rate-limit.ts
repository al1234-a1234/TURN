"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * حدّ محاولات دخول الموظّفين/الملّاك بعنوان الشبكة، عبر check_rate()
 * الموجودة أصلًا في القاعدة (تُستخدم فعليًّا داخل مسارات الضيف).
 *
 * الدالة مسحوبة من anon و authenticated (SECURITY DEFINER بلا EXECUTE
 * عام)، فالنداء إليها لا يمرّ إلا بمفتاح الخدمة — وهذا المنفذ الوحيد له
 * من مسار الدخول، كي يبقى التوسّع في ملفٍّ واحد لا في صفحتي الدخول.
 *
 * يفشل مفتوحًا دائمًا: خطأٌ في القراءة أو في القاعدة يعني «اسمح» —
 * حبسُ موظّفٍ حقيقي بسبب عطبٍ في حارسٍ ثانويّ أسوأ من عشر محاولاتٍ إضافية.
 */
export async function checkLoginRate(): Promise<boolean> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for") ?? "";
    const ip = fwd.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
    if (ip === "unknown") return true;

    const admin = createAdminClient();
    if (!admin) return true;

    const { data, error } = await admin.rpc("check_rate", {
      p_key: `login:ip:${ip}`,
      p_max: 10,
      p_window: "10 minutes",
    });
    if (error) {
      console.error("[checkLoginRate]", error.code, error.message);
      return true;
    }
    return data === true;
  } catch (err) {
    console.error("[checkLoginRate]", err);
    return true;
  }
}
