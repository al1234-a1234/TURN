"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { requirePerm, resolveWriteBranch, callerBranchIds } from "../guard";

export async function updateRestaurantInfo(formData: FormData) {
  const caller = await requirePerm("settings");
  if (!caller) return;
  const { supabase, restaurantId: rid } = caller;
  // هوية العلامة (الاسم/الشعار/الوصف) لمالكها — سياسة restaurants ترفض غيره
  if (caller.branchId) return;
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const logo_url = String(formData.get("logo_url") ?? "").trim() || null;
  const cover_url = String(formData.get("cover_url") ?? "").trim() || null;
  const cuisine = String(formData.get("cuisine") ?? "").trim() || null;
  const cuisine_en = String(formData.get("cuisine_en") ?? "").trim() || null;
  const patch: TablesUpdate<"restaurants"> = { logo_url, cover_url, description, cuisine, cuisine_en };
  if (name) patch.name = name;
  const { error } = await supabase.from("restaurants").update(patch).eq("id", rid);
  // إبطال الكاش بعد كتابةٍ فاشلة يبثّ حالةً لم تُحفظ: تعود الصفحة بالقيم القديمة
  // فيقرأها المالك كأنّ التعديل سرى. لا نُعيد التحقّق إلا بعد كتابةٍ تمّت.
  if (error) {
    console.error("[updateRestaurantInfo]", error.message);
    return;
  }
  revalidatePath("/dashboard/manage");
  revalidateTag("discovery");
}

export async function updateBranchSettings(formData: FormData) {
  const caller = await requirePerm("settings");
  if (!caller) return;
  const { supabase } = caller;

  const acceptsWaitlist = formData.get("accepts_waitlist") === "on";
  const wantsReservations = formData.get("accepts_reservations") === "on";
  const maxPartyRaw = String(formData.get("max_party_size") ?? "").trim();
  const maxParty = maxPartyRaw ? Math.max(1, Number(maxPartyRaw)) : 20;
  const open = String(formData.get("open_time") ?? "").trim() || null;
  const close = String(formData.get("close_time") ?? "").trim() || null;

  // أقسام الجلوس لم تعد هنا: صارت جدولًا يعرّفه المالك بأسمائه (branch_zones)
  // في صفحة الطاولات. وحذف المربّعين من النموذج يعني أن قراءتهما هنا كانت
  // ستكتب «خارجي مُطفأ» في كل حفظٍ للإعدادات — إطفاءُ قسمٍ لم يطلبه أحد.
  // نحدّث الفرع المعروض في النموذج فقط (لا نطمس بقية الفروع).
  // resolveWriteBranch يجبر المربوط بفرع على فرعه ويتحقّق أن المُرسَل من مطعمه.
  const branchId = await resolveWriteBranch(caller, String(formData.get("branch_id") ?? ""));
  if (!branchId) return;

  // حارس الحجوزات: الحجز يخصّص طاولةً بعينها (pick_table_for)، ففرعٌ بلا
  // طاولات يقبل حجوزاتٍ لا تحجز شيئًا، ولا يعرف متى امتلأ. الواجهة تُعطّل
  // المفتاح، وهذا يمنع تجاوزها — طلبٌ مصنوع باليد كان سيمرّ.
  let acceptsReservations = wantsReservations;
  if (acceptsReservations) {
    const { count } = await supabase
      .from("tables").select("id", { count: "exact", head: true })
      .eq("branch_id", branchId).eq("is_active", true);
    if ((count ?? 0) === 0) acceptsReservations = false;
  }

  const patch: TablesUpdate<"branch_settings"> = {
    accepts_waitlist: acceptsWaitlist,
    accepts_reservations: acceptsReservations,
    max_party_size: Number.isFinite(maxParty) ? maxParty : 20,
    opening_hours: { open, close },
  };

  // حقلا الحجز يغيبان عن النموذج حين لا طاولات للفرع. الكتابة بقيمةٍ افتراضية
  // حينها تطمس ما ضبطه المالك سابقًا — فلا نكتب إلا ما أُرسل فعلًا.
  const durationRaw = formData.get("default_duration_min");
  if (durationRaw != null) {
    const n = Math.round(Number(String(durationRaw).trim()));
    // ١٥ دقيقة أرضية القيد في القاعدة، وستّ ساعات سقفٌ يمنع خطأً مطبعيًّا
    // من إقفال الطاولة يومًا كاملًا
    if (Number.isFinite(n)) patch.default_duration_min = Math.min(Math.max(n, 15), 360);
  }
  const windowRaw = formData.get("booking_window_days");
  if (windowRaw != null) {
    const n = Math.round(Number(String(windowRaw).trim()));
    if (Number.isFinite(n)) patch.booking_window_days = Math.min(Math.max(n, 1), 365);
  }

  const { error } = await supabase
    .from("branch_settings")
    .update(patch)
    .eq("branch_id", branchId);

  // فشلٌ صامت هنا يعني فرعًا ظنّه المالك مغلقًا وهو ما زال يستقبل أدوارًا
  if (error) {
    console.error("[updateBranchSettings]", error.message);
    return;
  }

  revalidatePath("/dashboard/manage");
  revalidateTag("discovery");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/reservations");
  // إغلاق الطابور/تغيير الدوام لازم يصل صفحات العميل المكاشة فورًا
  revalidatePath("/r/[slug]", "page");
}

// ---------- الفروع والمواقع ----------
export async function addBranch(formData: FormData) {
  const caller = await requirePerm("settings");
  if (!caller) return;
  const { supabase, restaurantId: rid } = caller;
  // فتح فرع جديد قرار مالك العلامة — المربوط بفرع لا يفتح فروعًا (RLS يمنعه أيضًا)
  if (caller.branchId) return;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const city = String(formData.get("city") ?? "").trim() || null;
  const address = String(formData.get("address") ?? "").trim() || null;
  const { error } = await supabase.from("branches").insert({ restaurant_id: rid, name, city, address });
  if (error) {
    console.error("[addBranch]", error.message);
    return;
  }
  revalidatePath("/dashboard/manage");
  revalidateTag("discovery");
  revalidatePath("/dashboard");
}

export async function deleteBranch(formData: FormData) {
  const caller = await requirePerm("settings");
  if (!caller) return;
  const { supabase, restaurantId: rid } = caller;
  // حذف فرع قرار مالك العلامة — لا يحذف فرانشايز فرعه ولا فرع غيره
  if (caller.branchId) return;
  const id = String(formData.get("branch_id") ?? "");
  if (!id) return;
  // لا تحذف آخر فرع فعّال
  const { count } = await supabase
    .from("branches")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", rid)
    .eq("is_active", true);
  if ((count ?? 0) <= 1) return;
  // حذف ناعم لا صلب: كل جداول الفرع مرتبطة به بـ ON DELETE CASCADE، فحذفه
  // الصلب كان يمحو معه تاريخ الطوابير والحجوزات والإحصاءات كاملًا (آلاف الصفوف
  // للفرع الواحد) في لحظة، بلا رجعة ولا نسخة لحظية تستعيدها — وهذا التاريخ هو
  // نفسه القيمة التي نبيعها للمالك. التعطيل يُخفي الفرع عن العميل وعن اللوحة
  // (كل المسارات تفلتر is_active) ويُبقي التاريخ سليمًا وقابلًا للإرجاع.
  const { error } = await supabase
    .from("branches").update({ is_active: false })
    .eq("id", id).eq("restaurant_id", rid);
  if (error) {
    console.error("[deleteBranch]", error.message);
    return;
  }
  revalidatePath("/dashboard/manage");
  revalidateTag("discovery");
  revalidatePath("/dashboard");
}

export async function toggleMenuItem(formData: FormData) {
  const caller = await requirePerm("settings");
  if (!caller) return;
  const id = String(formData.get("item_id") ?? "");
  const available = formData.get("available") === "true";
  if (!id) return;
  const { error } = await caller.supabase
    .from("menu_items").update({ is_available: available })
    .eq("id", id).in("branch_id", await callerBranchIds(caller));
  // صنف يظهر متاحًا للعميل بينما ظنّه المطعم موقوفًا = طلبات لا يستطيع تلبيتها
  if (error) {
    console.error("[toggleMenuItem]", error.message);
    return;
  }
  revalidatePath("/dashboard/manage");
  revalidateTag("discovery");
}

export async function addMenuCategory(formData: FormData) {
  const caller = await requirePerm("settings");
  if (!caller) return;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  // الترجمة اختيارية: فارغة تعني «اعرض العربية» لا «اعرض فراغًا»
  const name_en = String(formData.get("name_en") ?? "").trim() || null;
  const branchId = await resolveWriteBranch(caller, formData.get("branch_id") as string);
  if (!branchId) return;
  const { error } = await caller.supabase
    .from("menu_categories")
    .insert({ restaurant_id: caller.restaurantId, branch_id: branchId, name, name_en });
  if (error) {
    console.error("[addMenuCategory]", error.message);
    return;
  }
  revalidatePath("/dashboard/manage");
  revalidateTag("discovery");
}

export async function deleteMenuCategory(id: string) {
  const caller = await requirePerm("settings");
  if (!caller) return;
  const { error } = await caller.supabase
    .from("menu_categories").delete()
    .eq("id", id).in("branch_id", await callerBranchIds(caller));
  if (error) {
    console.error("[deleteMenuCategory]", error.message);
    return;
  }
  revalidatePath("/dashboard/manage");
  revalidateTag("discovery");
}

// القائمة القائمة لا تُترجَم بالحذف وإعادة الإدخال. من كتب قائمته قبل أن
// يوجد عمود الإنجليزية — وهم كلّ مطاعمنا اليوم — لم يكن أمامه إلا أن يمحو
// الصنف ويعيده، فيمحو معه صورته المرفوعة وتاريخه. فهذان تحديثان يمسّان
// حقلي الترجمة وحدهما: العربية لا تُلمس، والفراغ يعني «ارجع للعربية».
export async function updateMenuCategoryTranslation(formData: FormData) {
  const caller = await requirePerm("settings");
  if (!caller) return;
  const id = String(formData.get("category_id") ?? "");
  if (!id) return;
  const name_en = String(formData.get("name_en") ?? "").trim() || null;
  const { error } = await caller.supabase
    .from("menu_categories").update({ name_en })
    .eq("id", id).in("branch_id", await callerBranchIds(caller));
  if (error) {
    console.error("[updateMenuCategoryTranslation]", error.message);
    return;
  }
  revalidatePath("/dashboard/manage");
  revalidateTag("discovery");
}

export async function updateMenuItemTranslation(formData: FormData) {
  const caller = await requirePerm("settings");
  if (!caller) return;
  const id = String(formData.get("item_id") ?? "");
  if (!id) return;
  const name_en = String(formData.get("name_en") ?? "").trim() || null;
  const description_en = String(formData.get("description_en") ?? "").trim() || null;
  const { error } = await caller.supabase
    .from("menu_items").update({ name_en, description_en })
    .eq("id", id).in("branch_id", await callerBranchIds(caller));
  if (error) {
    console.error("[updateMenuItemTranslation]", error.message);
    return;
  }
  revalidatePath("/dashboard/manage");
  revalidateTag("discovery");
}

export async function addMenuItem(formData: FormData) {
  const caller = await requirePerm("settings");
  if (!caller) return;
  const { supabase, restaurantId: rid } = caller;
  const categoryId = String(formData.get("category_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!categoryId || !name) return;
  const priceRaw = String(formData.get("price") ?? "").trim();
  const price = priceRaw ? Number(priceRaw) : null;
  const description = String(formData.get("description") ?? "").trim() || null;
  const name_en = String(formData.get("name_en") ?? "").trim() || null;
  const description_en = String(formData.get("description_en") ?? "").trim() || null;
  const image_url = String(formData.get("image_url") ?? "").trim() || null;
  const branchId = await resolveWriteBranch(caller, formData.get("branch_id") as string);
  if (!branchId) return;
  // التصنيف يأتي من الطلب: نتأكّد أنه من تصنيفات هذا الفرع فعلًا، وإلا صار
  // بالإمكان ربط صنفٍ بتصنيف مطعمٍ آخر — مفتاح أجنبي بلا معنى يفسد القائمة.
  const { data: cat } = await supabase
    .from("menu_categories").select("id").eq("id", categoryId).eq("branch_id", branchId).maybeSingle();
  if (!cat) return;
  const { error } = await supabase.from("menu_items").insert({
    restaurant_id: rid,
    branch_id: branchId,
    category_id: categoryId,
    name,
    name_en,
    price: Number.isFinite(price as number) ? price : null,
    description,
    description_en,
    image_url,
  });
  if (error) {
    console.error("[addMenuItem]", error.message);
    return;
  }
  revalidatePath("/dashboard/manage");
  revalidateTag("discovery");
}

export async function deleteMenuItem(id: string) {
  const caller = await requirePerm("settings");
  if (!caller) return;
  const { error } = await caller.supabase
    .from("menu_items").delete()
    .eq("id", id).in("branch_id", await callerBranchIds(caller));
  if (error) {
    console.error("[deleteMenuItem]", error.message);
    return;
  }
  revalidatePath("/dashboard/manage");
  revalidateTag("discovery");
}
