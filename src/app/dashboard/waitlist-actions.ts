"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/lib/supabase/database.types";

type Action = "seated" | "cancelled" | "notified";

export async function updateWaitlistStatus(id: string, action: Action) {
  const supabase = await createClient();

  const patch: TablesUpdate<"waitlist_entries"> = { status: action };
  if (action === "seated") patch.seated_at = new Date().toISOString();
  if (action === "notified") patch.notified_at = new Date().toISOString();

  await supabase.from("waitlist_entries").update(patch).eq("id", id);
  revalidatePath("/dashboard");
}
