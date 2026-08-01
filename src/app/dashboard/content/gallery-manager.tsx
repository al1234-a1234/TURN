"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadMedia } from "@/lib/upload-action";
import { addRestaurantPhoto, deleteRestaurantPhoto } from "./gallery-actions";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

type Photo = { id: string; url: string; caption: string | null };

export function GalleryManager({ restaurantId, branchId, photos }: { restaurantId: string; branchId: string; photos: Photo[] }) {
  const lang = useLang();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setBusy(true);
    setErr(null);
    // الرفع عبر الخادم — نفس مسار image-uploader (جلسة الكوكيز الموثوقة)
    try {
      for (const file of files) {
        if (file.size > 15 * 1024 * 1024) {
          setErr(tr(lang, "بعض الصور تجاوزت 15MB", "Some images exceed 15MB"));
          continue;
        }
        const fd = new FormData();
        fd.set("file", file);
        fd.set("restaurant_id", restaurantId);
        fd.set("prefix", "gallery");
        const res = await uploadMedia(fd);
        if ("error" in res) {
          setErr(res.error);
          continue;
        }
        await addRestaurantPhoto(res.url, undefined, branchId);
      }
      router.refresh();
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div>
      <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {photos.map((p) => (
          <div key={p.id} className="group relative aspect-square overflow-hidden rounded-2xl border" style={{ borderColor: "var(--border)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={p.caption ?? ""} className="h-full w-full object-cover" />
            <form action={deleteRestaurantPhoto} className="absolute end-1 top-1">
              <input type="hidden" name="photo_id" value={p.id} />
              <button className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-sm text-cream-100 transition hover:bg-[color:var(--danger)]" title={tr(lang, "حذف", "Delete")}>
                ✕
              </button>
            </form>
          </div>
        ))}
        <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border border-dashed text-center text-[color:var(--muted)]" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
          <span className="text-2xl">{busy ? "⏳" : "＋"}</span>
          <span className="px-1 text-[11px] font-bold">{busy ? tr(lang, "جارٍ الرفع…", "Uploading…") : tr(lang, "أضف صورًا", "Add photos")}</span>
          <input type="file" accept="image/*" multiple onChange={onFiles} disabled={busy} className="hidden" />
        </label>
      </div>
      {err && <p className="text-xs text-[color:var(--danger)]">{err}</p>}
      <p className="text-xs text-[color:var(--muted)]">{tr(lang, "أضف صور مطعمك من الداخل والخارج — يتصفّحها العميل في صفحتك.", "Add photos of your restaurant inside and out — customers browse them on your page.")}</p>
    </div>
  );
}
