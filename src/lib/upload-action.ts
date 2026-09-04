"use server";

import { createClient } from "@/lib/supabase/server";

export type UploadResult = { url: string } | { error: string };

/**
 * رفع صورة عبر الخادم — لا عبر جلسة المتصفح.
 * السبب: الرفع المباشر من المتصفح كان يفشل بجلسات متقادمة/مكسورة بينما
 * كل أزرار الحفظ (server actions) تعمل بجلسة الكوكيز الموثوقة نفسها.
 * الآن الرفع يسلك الطريق الموثوق ذاته، وRLS التخزين يبقى الحكم الأخير.
 */
export async function uploadMedia(formData: FormData): Promise<UploadResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "انتهت الجلسة — سجّل الدخول من جديد" };

  const file = formData.get("file");
  const restaurantId = String(formData.get("restaurant_id") ?? "").trim();
  const prefix = String(formData.get("prefix") ?? "img").replace(/[^a-z0-9_-]/gi, "").slice(0, 32) || "img";
  if (!(file instanceof File) || !restaurantId) return { error: "طلب غير مكتمل" };

  // حزامٌ ثانٍ دفاعيّ فقط: RLS التخزين هو الحكم الفعلي على المسار (media)،
  // لكن نتحقّق هنا أيضًا أن الجلسة تخصّ موظّفًا/مديرًا في restaurantId
  // المُرسل تحديدًا — لا مطعمٍ آخر يملكه المستخدم نفسه بحسابٍ مختلف.
  const [{ data: hasPerm }, { data: isManager }] = await Promise.all([
    supabase.rpc("staff_has_perm", { rest_id: restaurantId, p_perm: "settings" }),
    supabase.rpc("is_manager_of", { rest_id: restaurantId }),
  ]);
  if (!hasPerm && !isManager) return { error: "لا تملك صلاحية الرفع لهذا المطعم" };

  const MIME_EXT: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
    "image/gif": "gif",
  };
  const ext = MIME_EXT[file.type];
  if (!ext) return { error: "صيغة غير مدعومة (JPG/PNG/WebP فقط)" };
  if (file.size > 15 * 1024 * 1024) return { error: "الصورة أكبر من 15MB" };

  const path = `restaurants/${restaurantId}/${prefix}-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("media")
    .upload(path, file, { upsert: true, cacheControl: "3600", contentType: file.type });
  if (error) {
    return {
      error: /size|large|payload|exceed/i.test(error.message ?? "")
        ? "الصورة كبيرة جدًا — جرّب صورة أصغر"
        : "تعذّر رفع الصورة — تأكد من صلاحيتك وحاول ثانية",
    };
  }
  const { data } = supabase.storage.from("media").getPublicUrl(path);
  return { url: data.publicUrl };
}
