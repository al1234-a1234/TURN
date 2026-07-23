"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TablesInsert, Database } from "@/lib/supabase/database.types";

type OfferKind = Database["public"]["Enums"]["offer_kind"];
const KINDS: OfferKind[] = ["percent", "fixed", "free_item", "bogo", "points"];
const AUDIENCES = ["all", "new", "loyalty", "walkaway", "slow_hours"];

/** يتحقق أن المستخدم موظف في هذا المطعم؛ RLS يفرض صلاحية العروض عند الكتابة. */
async function resolveRestaurant() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, rid: null as string | null };
  const { data } = await supabase
    .from("staff")
    .select("restaurant_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  return { supabase, rid: data?.restaurant_id ?? null };
}

function toNumberOrNull(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function createOffer(formData: FormData) {
  const { supabase, rid } = await resolveRestaurant();
  if (!rid) return;

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const kindRaw = String(formData.get("kind") ?? "percent");
  const kind: OfferKind = (KINDS as string[]).includes(kindRaw) ? (kindRaw as OfferKind) : "percent";
  const audienceRaw = String(formData.get("audience") ?? "all");
  const audience = AUDIENCES.includes(audienceRaw) ? audienceRaw : "all";

  const startRaw = String(formData.get("ends_at") ?? "").trim();

  const offer: TablesInsert<"offers"> = {
    restaurant_id: rid,
    title,
    description: String(formData.get("description") ?? "").trim() || null,
    kind,
    value: kind === "free_item" || kind === "bogo" ? null : toNumberOrNull(formData.get("value")),
    code: String(formData.get("code") ?? "").trim().toUpperCase() || null,
    audience,
    ends_at: startRaw ? new Date(startRaw).toISOString() : null,
    total_limit: toNumberOrNull(formData.get("total_limit")),
    per_customer_limit: toNumberOrNull(formData.get("per_customer_limit")) ?? 1,
    is_active: true,
  };

  await supabase.from("offers").insert(offer);
  revalidatePath("/dashboard/offers");
}

export async function toggleOffer(id: string, next: boolean) {
  const supabase = await createClient();
  await supabase.from("offers").update({ is_active: next }).eq("id", id);
  revalidatePath("/dashboard/offers");
}

export async function deleteOffer(formData: FormData) {
  const id = String(formData.get("offer_id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("offers").delete().eq("id", id);
  revalidatePath("/dashboard/offers");
}
