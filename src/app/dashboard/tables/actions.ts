"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requirePerm, callerBranchIds, resolveWriteBranch, type Caller } from "../guard";
import { zoneKeyFrom } from "@/lib/zones";
import type { TablesInsert } from "@/lib/supabase/database.types";

function intOr(raw: FormDataEntryValue | null, fallback: number): number {
  raw = String(raw ?? "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  const n = Number(String(raw ?? "").trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}

export async function addTable(formData: FormData) {
  const caller = await requirePerm("settings");
  if (!caller) return;
  // الفرع المختار من المبدّل، لا الفرع الأقدم دائمًا — وإلا هبطت طاولات
  // كل الفروع في الفرع الأوّل ولم يقدر بقيّة الفروع على إضافة طاولة أبدًا.
  const branchId = await resolveWriteBranch(caller, String(formData.get("branch_id") ?? ""));
  if (!branchId) return;
  const label = String(formData.get("label") ?? "").trim();
  if (!label) return;
  // القسم كما اختاره المالك من أقسام فرعه — والحارس في القاعدة
  // (trg_tables_zone_belongs) يمنع مفتاحًا غريبًا.
  const zone = String(formData.get("zone") ?? "").trim() || null;

  const row: TablesInsert<"tables"> = {
    branch_id: branchId,
    label,
    zone,
    seats: intOr(formData.get("seats"), 4),
    is_active: true,
  };
  // RLS يفرض is_manager_of عبر سياسة "managers manage tables"
  const { error } = await caller.supabase.from("tables").insert(row);
  // طاولة لم تُضَف تبدو مضافة = خريطة جلوس تخالف الواقع عند الإجلاس
  if (error) {
    console.error("[addTable]", error.message);
    return;
  }
  revalidatePath("/dashboard/tables");
}

export async function deleteTable(formData: FormData) {
  const id = String(formData.get("table_id") ?? "");
  if (!id) return;
  const caller = await requirePerm("settings");
  if (!caller) return;
  const { error } = await caller.supabase
    .from("tables")
    .delete()
    .eq("id", id)
    .in("branch_id", await callerBranchIds(caller));
  if (error) {
    console.error("[deleteTable]", error.message);
    return;
  }
  revalidatePath("/dashboard/tables");
}

// ═══════════════════════════════════════════════════════════════
// الأقسام — يعرّفها المالك
// ═══════════════════════════════════════════════════════════════

/** أقسام فرعٍ مرتّبة (تُستعمل لتوليد مفتاحٍ غير مكرّر ولترتيب الجديد). */
async function zonesOf(supabase: Caller["supabase"], branchId: string) {
  const { data } = await supabase
    .from("branch_zones")
    .select("id, key, sort_order")
    .eq("branch_id", branchId)
    .order("sort_order");
  return data ?? [];
}

export async function addZone(formData: FormData) {
  const caller = await requirePerm("settings");
  if (!caller) return;
  const branchId = await resolveWriteBranch(caller, String(formData.get("branch_id") ?? ""));
  if (!branchId) return;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const nameEn = String(formData.get("name_en") ?? "").trim() || null;

  const existing = await zonesOf(caller.supabase, branchId);
  // المفتاح يُولَّد ولا يُطلَب من المالك: هو تفصيلٌ تقنيّ (‎^[a-z0-9_]{2,24}$)
  // لا معنى له عنده، واسمه العربي لا يصلح مفتاحًا.
  const key = zoneKeyFrom(name, new Set(existing.map((z) => z.key)));
  const sort = Math.max(0, ...existing.map((z) => z.sort_order ?? 0)) + 1;

  const { error } = await caller.supabase
    .from("branch_zones")
    .insert({ branch_id: branchId, key, name, name_en: nameEn, sort_order: sort });
  if (error) {
    console.error("[addZone]", error.message);
    return;
  }
  revalidateZones();
}

export async function renameZone(formData: FormData) {
  const caller = await requirePerm("settings");
  if (!caller) return;
  const id = String(formData.get("zone_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;
  const nameEn = String(formData.get("name_en") ?? "").trim() || null;

  // المفتاح لا يُمسّ: تغييره ييتّم كل طاولةٍ ودورٍ يحمله.
  const { error } = await caller.supabase
    .from("branch_zones")
    .update({ name, name_en: nameEn })
    .eq("id", id)
    .in("branch_id", await callerBranchIds(caller));
  if (error) {
    console.error("[renameZone]", error.message);
    return;
  }
  revalidateZones();
}

export async function setZoneActive(formData: FormData) {
  const caller = await requirePerm("settings");
  if (!caller) return;
  const id = String(formData.get("zone_id") ?? "");
  if (!id) return;
  const active = formData.get("active") === "true";

  const branchIds = await callerBranchIds(caller);

  // آخر قسمٍ فعّال لا يُطفأ: فرعٌ بلا قسمٍ واحد لا يستطيع استقبال دورٍ ولا
  // حجز، والحارس في القاعدة لن يجد قسمًا يقصّ إليه.
  if (!active) {
    const { data: z } = await caller.supabase
      .from("branch_zones").select("branch_id").eq("id", id).in("branch_id", branchIds).maybeSingle();
    if (!z) return;
    const { count } = await caller.supabase
      .from("branch_zones").select("id", { count: "exact", head: true })
      .eq("branch_id", z.branch_id).eq("is_active", true);
    if ((count ?? 0) <= 1) return;
  }

  const { error } = await caller.supabase
    .from("branch_zones").update({ is_active: active }).eq("id", id).in("branch_id", branchIds);
  if (error) {
    console.error("[setZoneActive]", error.message);
    return;
  }
  revalidateZones();
}

export async function moveZone(formData: FormData) {
  const caller = await requirePerm("settings");
  if (!caller) return;
  const id = String(formData.get("zone_id") ?? "");
  const dir = String(formData.get("dir") ?? "");
  if (!id || (dir !== "up" && dir !== "down")) return;

  const branchIds = await callerBranchIds(caller);
  const { data: me } = await caller.supabase
    .from("branch_zones").select("id, branch_id, sort_order").eq("id", id).in("branch_id", branchIds).maybeSingle();
  if (!me) return;

  const list = await zonesOf(caller.supabase, me.branch_id);
  const i = list.findIndex((z) => z.id === id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return;

  // تبديل الترتيبين. لو تساويا (بياناتٌ قديمة) نكتب الفهرس بدل التبديل
  // العقيم — وإلا بقي الزرّ لا يفعل شيئًا والمالك يظنّه معطوبًا.
  const a = list[i].sort_order ?? i;
  const b = list[j].sort_order ?? j;
  const [na, nb] = a === b ? [j, i] : [b, a];

  await caller.supabase.from("branch_zones").update({ sort_order: na }).eq("id", list[i].id);
  await caller.supabase.from("branch_zones").update({ sort_order: nb }).eq("id", list[j].id);
  revalidateZones();
}

/** القسم يظهر للمالك وللعميل معًا — فكلّ ما يعرضه يُبطَل. */
function revalidateZones() {
  revalidatePath("/dashboard/tables");
  revalidatePath("/dashboard/reception");
  revalidatePath("/dashboard/manage");
  revalidatePath("/r/[slug]", "page");
  revalidateTag("discovery");
}
