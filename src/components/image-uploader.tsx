"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * يرفع صورة إلى Supabase Storage (bucket: media) تحت مجلّد المطعم،
 * ويضع الرابط العام في input مخفي باسم `name` ليُرسَل مع النموذج.
 */
export function ImageUploader({
  restaurantId,
  name,
  label,
  defaultUrl,
  shape = "square",
}: {
  restaurantId: string;
  name: string;
  label: string;
  defaultUrl?: string | null;
  shape?: "square" | "wide" | "circle";
}) {
  const [url, setUrl] = useState(defaultUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setErr("الحد الأقصى 5MB");
      return;
    }
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `restaurants/${restaurantId}/${name}-${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("media")
      .upload(path, file, { upsert: true, cacheControl: "3600" });
    if (error) {
      setErr("تعذّر رفع الصورة");
      setBusy(false);
      return;
    }
    const { data } = supabase.storage.from("media").getPublicUrl(path);
    setUrl(data.publicUrl);
    setBusy(false);
  }

  const box =
    shape === "wide"
      ? "h-32 w-full"
      : shape === "circle"
        ? "h-24 w-24 rounded-full"
        : "h-24 w-24 rounded-2xl";

  return (
    <div>
      <p className="field-label">{label}</p>
      <input type="hidden" name={name} value={url} />
      <label className="flex cursor-pointer items-center gap-3">
        <span
          className={`${box} flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-[var(--border)] bg-sand-100 text-[color:var(--muted)] dark:bg-stone-800/50`}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-2xl">📷</span>
          )}
        </span>
        <span className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-bold text-brand-700 dark:text-brand-300">
          {busy ? "جارٍ الرفع…" : url ? "تغيير الصورة" : "اختر صورة"}
        </span>
        <input type="file" accept="image/*" onChange={onFile} className="hidden" />
      </label>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}
