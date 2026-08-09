"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * إدخال المطاعم بالجملة — لأنّ السقف يوم التسليم ساعاتُك لا الخوادم.
 *
 * القياس الذي دفع إلى بنائه: المطعم الجديد جاهزٌ للطابور من أوّل لحظة
 * (مفتوحٌ دائمًا، يقبل الانضمام، له قسمان وحساب مالك وكلّ الوحدات مفعّلة
 * افتراضًا). فلا شيء يستهلك الوقت في إدخال خمسةٍ وعشرين مطعمًا إلا تعبئة
 * النموذج نفسه خمسًا وعشرين مرّة، وتفريغ بيانات الاعتماد بعد كلّ مرّة.
 *
 * فيُلصق الكلّ دفعةً، وتُعاد بطاقة اعتمادٍ لكلّ مطعم في جدولٍ واحد.
 *
 * ولا يستنسخ منطق الإنشاء: ينادي نفس دالّة الحافّة `provision-owner` التي
 * يناديها النموذج المفرد — سطرًا بعد سطر. نسخةٌ ثانية من منطقٍ حسّاس
 * تفترق عن أصلها بعد شهر، والفرق يُكتشف في الإنتاج.
 *
 * والتتابع لا التوازي عمدًا: إنشاء مستخدمٍ في Auth عمليّةٌ لها حدّ معدّل،
 * وخمسةٌ وعشرون طلبًا دفعةً واحدة قد تُرفض نصفها بلا سببٍ مفهوم. والفارق
 * ثوانٍ معدودة.
 */
export type BulkRow = {
  name: string;
  slug: string;
  username: string;
  phone: string;
  city: string;
  ok: boolean;
  code?: string;
  error?: string;
};

export type BulkState = { rows?: BulkRow[]; error?: string };

/** يقرأ السطر: اسم، معرّف، اسم دخول، جوّال، مدينة — بفاصلة أو تبويب. */
function parseLine(line: string): Omit<BulkRow, "ok"> | null {
  const p = line.split(/\t|,|،/).map((s) => s.trim());
  if (p.length < 3 || !p[0] || !p[1] || !p[2]) return null;
  return {
    name: p[0],
    slug: p[1].toLowerCase(),
    username: p[2].toLowerCase(),
    phone: p[3] ?? "",
    city: p[4] ?? "",
  };
}

export async function bulkProvision(_prev: BulkState, formData: FormData): Promise<BulkState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "يجب تسجيل الدخول." };

  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) return { error: "غير مصرّح — مدير المنصّة فقط." };

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { error: "انتهت الجلسة — سجّل الدخول ثانيةً." };

  const raw = String(formData.get("rows") ?? "");
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { error: "الصق سطرًا واحدًا على الأقل." };
  // سقفٌ يمنع لصقة ملفٍّ كامل بالخطأ — ولا يعيق دفعةً واقعية
  if (lines.length > 60) return { error: "أكثر من ٦٠ سطرًا — قسّمها دفعتين." };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const out: BulkRow[] = [];

  for (const line of lines) {
    const parsed = parseLine(line);
    if (!parsed) {
      out.push({ name: line.slice(0, 40), slug: "", username: "", phone: "", city: "",
                 ok: false, error: "سطر ناقص — المطلوب: الاسم، المعرّف، اسم الدخول" });
      continue;
    }
    if (!/^[a-z0-9-]+$/.test(parsed.slug)) {
      out.push({ ...parsed, ok: false, error: "المعرّف: أحرف إنجليزية صغيرة وأرقام وشُرَط فقط" });
      continue;
    }

    try {
      const res = await fetch(`${url}/functions/v1/provision-owner`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anon,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          name: parsed.name, slug: parsed.slug, username: parsed.username,
          phone: parsed.phone, city: parsed.city, branch_name: "الفرع الرئيسي",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const map: Record<string, string> = {
          username_taken: "اسم الدخول مستعمل",
          slug_taken: "المعرّف مستعمل",
          forbidden: "غير مصرّح",
          bad_slug: "معرّف غير صالح",
          missing_fields: "حقول ناقصة",
        };
        out.push({ ...parsed, ok: false, error: map[data.error] ?? "تعذّر الإنشاء" });
      } else {
        out.push({ ...parsed, ok: true, code: data.code });
      }
    } catch {
      // سطرٌ يسقط لا يُسقط الدفعة: الباقي يُنشأ، والفاشل يُعاد وحده
      out.push({ ...parsed, ok: false, error: "تعذّر الاتصال" });
    }
  }

  revalidatePath("/admin");
  return { rows: out };
}
