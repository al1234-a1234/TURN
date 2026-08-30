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
  // تقييمٌ يكتبه المالك بذمّته (0122) — بديل مزامنة قوقل ماب لحين توفّر
  // مفتاح API. يُقصّ إلى [0..5] بمنزلةٍ عشرية، والفراغ يمسحه.
  const ratingRaw = String(formData.get("manual_rating") ?? "").trim();
  const ratingNum = ratingRaw ? Number(ratingRaw.replace(",", ".")) : NaN;
  const manual_rating = Number.isFinite(ratingNum)
    ? Math.round(Math.min(Math.max(ratingNum, 0), 5) * 10) / 10
    : null;
  const patch: TablesUpdate<"restaurants"> = { logo_url, cover_url, description, cuisine, cuisine_en, manual_rating };
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
  // الاسم والشعار والوصف يعيشون في صفحة المطعم العامة أيضًا — كانت تفوت،
  // فيبقى الزائر يرى القديم إلى أن يُبطلها تعديلُ إعدادات فرعٍ صدفةً.
  revalidatePath("/r/[slug]", "page");
}

/**
 * حفظٌ فوريّ لصورة العلامة (شعار/غلاف) لحظةَ اكتمال رفعها — لا عبر زرّ
 * «حفظ المعلومات».
 *
 * السبب حادثة فعلية: المشغّل اختار شعارًا جديدًا وضغط الحفظ قبل اكتمال
 * الرفع بثوانٍ (الرفع من جوّال يأخذ وقتًا)، فحُفظ الرابط القديم الذي كان
 * لا يزال في الحقل المخفيّ — ثلاث محاولات «ما تغيّرت الصورة» وهو مصيبٌ.
 * اختيار الصورة = حفظُها، كما يتوقّع مستخدمٌ غير تقنيّ أصلًا.
 */
export async function setRestaurantImage(field: "logo_url" | "cover_url", url: string | null) {
  const caller = await requirePerm("settings");
  if (!caller) return { ok: false };
  // هوية العلامة لمالكها — كما في updateRestaurantInfo أعلاه حرفيًّا
  if (caller.branchId) return { ok: false };
  // قائمة بيضاء صريحة: الحقل يأتي من العميل، ولا يُفتح باب كتابة عمودٍ حرّ
  if (field !== "logo_url" && field !== "cover_url") return { ok: false };
  const v = url && url.trim() !== "" ? url.trim() : null;
  const patch: TablesUpdate<"restaurants"> = field === "logo_url" ? { logo_url: v } : { cover_url: v };
  const { error } = await caller.supabase
    .from("restaurants")
    .update(patch)
    .eq("id", caller.restaurantId);
  if (error) {
    console.error("[setRestaurantImage]", error.message);
    return { ok: false };
  }
  revalidatePath("/dashboard/manage");
  revalidateTag("discovery");
  revalidatePath("/r/[slug]", "page");
  return { ok: true };
}

export async function updateBranchSettings(formData: FormData) {
  const caller = await requirePerm("settings");
  if (!caller) return;
  const { supabase } = caller;

  const acceptsWaitlist = formData.get("accepts_waitlist") === "on";
  const wantsReservations = formData.get("accepts_reservations") === "on";
  const maxPartyRaw = String(formData.get("max_party_size") ?? "").trim();
  const maxParty = maxPartyRaw ? Math.max(1, Number(maxPartyRaw)) : 20;
  // سقف حجم الطابور — فارغٌ يعني بلا سقف (الافتراضي)، لا صفرًا يمنع الجميع
  const maxWaitRaw = String(formData.get("max_waitlist_size") ?? "").trim();
  const maxWaitlist = maxWaitRaw ? Math.max(1, Math.round(Number(maxWaitRaw))) : null;
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

  // دوامٌ مختلف لبعض الأيام: المفتاح يوم الأسبوع (0=الأحد كـgetDay بتوقيت
  // الرياض)، ولا يُحتسب اليوم إلا بفتحٍ وإغلاقٍ معًا — نصف دوامٍ ليس دوامًا،
  // واليوم الفارغ يتبع open/close العامّين أعلاه.
  const days: Record<string, { open: string; close: string }> = {};
  for (let d = 0; d < 7; d++) {
    const dOpen = String(formData.get(`day_open_${d}`) ?? "").trim();
    const dClose = String(formData.get(`day_close_${d}`) ?? "").trim();
    if (dOpen && dClose) days[String(d)] = { open: dOpen, close: dClose };
  }

  const patch: TablesUpdate<"branch_settings"> = {
    accepts_waitlist: acceptsWaitlist,
    accepts_reservations: acceptsReservations,
    max_party_size: Number.isFinite(maxParty) ? maxParty : 20,
    max_waitlist_size: maxWaitlist,
    opening_hours: Object.keys(days).length ? { open, close, days } : { open, close },
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
// إنشاء فرعٍ جديد لم يعد هنا: صار حصرًا في /admin/[id] (صلاحية المنصّة لا
// المطعم). كانت addBranch هنا، وحارسها الوحيد caller.branchId — يمنع حسابًا
// مربوطًا بفرعٍ واحد، ولا يمنع صاحب المطعم نفسه. راجع ops/incidents/ للحادثة.

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

/**
 * حالة نموذجَي القائمة — الصمت لم يعد خيارًا.
 *
 * كانت كلّ مسارات الفشل هنا `return;` صامتة: بلا صلاحية، بلا فرع، تصنيف من
 * فرعٍ آخر، أو خطأ قاعدة — كلّها تُنهي الطلب بلا حرفٍ واحد على الشاشة. فيضغط
 * المالك «إضافة» فلا يحدث شيء، ويظنّ الزرّ معطوبًا أو الشبكة بطيئة، ويعيد
 * الضغط. وهو نفس نمط `ops/incidents/2026-08-29-stale-row-press-is-silent.md`.
 */
export type MenuFormState = { ok?: true; error?: string } | null;

export async function addMenuCategory(_prev: MenuFormState, formData: FormData): Promise<MenuFormState> {
  const caller = await requirePerm("settings");
  if (!caller) return { error: "لا تملك صلاحية تعديل القائمة — راجع مالك المطعم." };
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "اكتب اسم الفئة." };
  // الترجمة اختيارية: فارغة تعني «اعرض العربية» لا «اعرض فراغًا»
  const name_en = String(formData.get("name_en") ?? "").trim() || null;
  const branchId = await resolveWriteBranch(caller, formData.get("branch_id") as string);
  if (!branchId) return { error: "اختر فرعًا أولًا من أعلى الصفحة." };
  const { error } = await caller.supabase
    .from("menu_categories")
    .insert({ restaurant_id: caller.restaurantId, branch_id: branchId, name, name_en });
  if (error) {
    console.error("[addMenuCategory]", error.message);
    return { error: `تعذّر حفظ الفئة: ${error.message}` };
  }
  revalidatePath("/dashboard/manage");
  revalidateTag("discovery");
  return { ok: true };
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

export async function addMenuItem(_prev: MenuFormState, formData: FormData): Promise<MenuFormState> {
  const caller = await requirePerm("settings");
  if (!caller) return { error: "لا تملك صلاحية تعديل القائمة — راجع مالك المطعم." };
  const { supabase, restaurantId: rid } = caller;
  const categoryId = String(formData.get("category_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!categoryId) return { error: "أضف فئةً أولًا ثم أضف الصنف داخلها." };
  if (!name) return { error: "اكتب اسم الصنف." };
  const priceRaw = String(formData.get("price") ?? "").trim();
  const price = priceRaw ? Number(priceRaw) : null;
  // سعرٌ مكتوبٌ خطأً كان يُخزَّن null بصمت فيظهر الصنف بلا سعر
  if (priceRaw && !Number.isFinite(price)) return { error: "السعر أرقام فقط — مثال: 28.50" };
  const description = String(formData.get("description") ?? "").trim() || null;
  const name_en = String(formData.get("name_en") ?? "").trim() || null;
  const description_en = String(formData.get("description_en") ?? "").trim() || null;
  const image_url = String(formData.get("image_url") ?? "").trim() || null;
  const branchId = await resolveWriteBranch(caller, formData.get("branch_id") as string);
  if (!branchId) return { error: "اختر فرعًا أولًا من أعلى الصفحة." };
  // التصنيف يأتي من الطلب: نتأكّد أنه من تصنيفات هذا الفرع فعلًا، وإلا صار
  // بالإمكان ربط صنفٍ بتصنيف مطعمٍ آخر — مفتاح أجنبي بلا معنى يفسد القائمة.
  const { data: cat } = await supabase
    .from("menu_categories").select("id").eq("id", categoryId).eq("branch_id", branchId).maybeSingle();
  if (!cat) return { error: "هذه الفئة ليست في الفرع المختار — حدّث الصفحة وحاول ثانيةً." };
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
    return { error: `تعذّر حفظ الصنف: ${error.message}` };
  }
  revalidatePath("/dashboard/manage");
  revalidateTag("discovery");
  return { ok: true };
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
