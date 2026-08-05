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
  await supabase.from("restaurants").update(patch).eq("id", rid);
  revalidatePath("/dashboard/manage");
  revalidateTag("discovery");
}

export async function updateBranchSettings(formData: FormData) {
  const caller = await requirePerm("settings");
  if (!caller) return;
  const { supabase } = caller;

  const acceptsWaitlist = formData.get("accepts_waitlist") === "on";
  const acceptsReservations = formData.get("accepts_reservations") === "on";
  const maxPartyRaw = String(formData.get("max_party_size") ?? "").trim();
  const maxParty = maxPartyRaw ? Math.max(1, Number(maxPartyRaw)) : 20;
  const open = String(formData.get("open_time") ?? "").trim() || null;
  const close = String(formData.get("close_time") ?? "").trim() || null;

  // نحدّث الفرع المعروض في النموذج فقط (لا نطمس بقية الفروع).
  // resolveWriteBranch يجبر المربوط بفرع على فرعه ويتحقّق أن المُرسَل من مطعمه.
  const branchId = await resolveWriteBranch(caller, String(formData.get("branch_id") ?? ""));
  if (!branchId) return;

  await supabase
    .from("branch_settings")
    .update({
      accepts_waitlist: acceptsWaitlist,
      accepts_reservations: acceptsReservations,
      max_party_size: Number.isFinite(maxParty) ? maxParty : 20,
      opening_hours: { open, close },
    })
    .eq("branch_id", branchId);

  revalidatePath("/dashboard/manage");
  revalidateTag("discovery");
  revalidatePath("/dashboard");
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
  await supabase.from("branches").insert({ restaurant_id: rid, name, city, address });
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
  // لا تحذف آخر فرع
  const { count } = await supabase
    .from("branches")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", rid);
  if ((count ?? 0) <= 1) return;
  await supabase.from("branches").delete().eq("id", id).eq("restaurant_id", rid);
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
  await caller.supabase
    .from("menu_items").update({ is_available: available })
    .eq("id", id).in("branch_id", await callerBranchIds(caller));
  revalidatePath("/dashboard/manage");
  revalidateTag("discovery");
}

export async function addMenuCategory(formData: FormData) {
  const caller = await requirePerm("settings");
  if (!caller) return;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const branchId = await resolveWriteBranch(caller, formData.get("branch_id") as string);
  if (!branchId) return;
  await caller.supabase.from("menu_categories").insert({ restaurant_id: caller.restaurantId, branch_id: branchId, name });
  revalidatePath("/dashboard/manage");
  revalidateTag("discovery");
}

export async function deleteMenuCategory(id: string) {
  const caller = await requirePerm("settings");
  if (!caller) return;
  await caller.supabase
    .from("menu_categories").delete()
    .eq("id", id).in("branch_id", await callerBranchIds(caller));
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
  const image_url = String(formData.get("image_url") ?? "").trim() || null;
  const branchId = await resolveWriteBranch(caller, formData.get("branch_id") as string);
  if (!branchId) return;
  await supabase.from("menu_items").insert({
    restaurant_id: rid,
    branch_id: branchId,
    category_id: categoryId,
    name,
    price: Number.isFinite(price as number) ? price : null,
    description,
    image_url,
  });
  revalidatePath("/dashboard/manage");
  revalidateTag("discovery");
}

export async function deleteMenuItem(id: string) {
  const caller = await requirePerm("settings");
  if (!caller) return;
  await caller.supabase
    .from("menu_items").delete()
    .eq("id", id).in("branch_id", await callerBranchIds(caller));
  revalidatePath("/dashboard/manage");
  revalidateTag("discovery");
}
