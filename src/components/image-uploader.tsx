"use client";

import { useState } from "react";
import { uploadMedia } from "@/lib/upload-action";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

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
  const lang = useLang();
  const [url, setUrl] = useState(defaultUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /** تصغير الصورة قبل الرفع: صورة جوال خام (5MB) كانت تُخزَّن وتُنزَّل كما
      هي على كل زائر — أكبر مستهلك بيانات وبطء في الرئيسية وصفحة المطعم.
      نصغّر لأبعاد العرض الفعلية ونحوّل WebP. أي فشل → نرفع الأصل كما كان. */
  async function compress(file: File): Promise<{ blob: Blob; type: string; ext: string }> {
    const MAX = shape === "wide" ? 1600 : 800; // غلاف عريض يحتاج دقة أعلى من شعار
    try {
      // createImageBitmap يفشل على بعض المتصفحات/الصور — فكان يُرفع الأصل
      // الخام (8–12MB من كاميرا الجوال) ويرفضه الخادم: «كل» الصور تتعذّر.
      // مسار احتياطي عبر <img> يفكّ ما عجز عنه الأول.
      const bmp: ImageBitmap | HTMLImageElement = await createImageBitmap(file).catch(
        () =>
          new Promise<HTMLImageElement>((res, rej) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(url); res(img); };
            img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("decode")); };
            img.src = url;
          }),
      );
      const w = "naturalWidth" in bmp ? bmp.naturalWidth : bmp.width;
      const h = "naturalHeight" in bmp ? bmp.naturalHeight : bmp.height;
      const scale = Math.min(1, MAX / Math.max(w, h));
      // صغيرة أصلًا وليست PNG ضخمة؟ ارفعها كما هي
      if (scale === 1 && file.size < 400 * 1024) return { blob: file, type: file.type, ext: "" };
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      // webp ثم jpeg احتياطًا (متصفحات لا تصدّر webp)
      let blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", 0.85));
      if (blob && blob.type === "image/webp" && blob.size < file.size) return { blob, type: "image/webp", ext: "webp" };
      blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
      if (blob && blob.size < file.size) return { blob, type: "image/jpeg", ext: "jpg" };
      return { blob: file, type: file.type, ext: "" };
    } catch {
      return { blob: file, type: file.type, ext: "" };
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // نوع الملف من محتواه (MIME) لا من امتداد الاسم — نمنع رفع SVG/HTML وما شابه
    const MIME_EXT: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/avif": "avif",
      "image/gif": "gif",
    };
    const ext = MIME_EXT[file.type];
    if (!ext) {
      setErr(tr(lang, "صيغة غير مدعومة (JPG/PNG/WebP فقط)", "Unsupported format (JPG/PNG/WebP only)"));
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setErr(tr(lang, "الحد الأقصى 15MB", "Max size 15MB"));
      return;
    }
    setBusy(true);
    setErr(null);
    // الرفع عبر الخادم (server action) لا عبر جلسة المتصفح — جلسة متصفح
    // متقادمة كانت تُفشل كل رفع بينما أزرار الحفظ العادية تعمل. الآن الرفع
    // يسلك الطريق الموثوق نفسه الذي تسلكه أزرار الحفظ.
    const up = await compress(file);
    const fd = new FormData();
    fd.set("file", new File([up.blob], `${name}.${up.ext || ext}`, { type: up.type }));
    fd.set("restaurant_id", restaurantId);
    fd.set("prefix", name);
    const res = await uploadMedia(fd);
    if ("error" in res) {
      setErr(res.error);
      setBusy(false);
      return;
    }
    setUrl(res.url);
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
          className={`${box} flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-[var(--border)] bg-sand-100 text-[color:var(--muted)] `}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-2xl">📷</span>
          )}
        </span>
        <span className="rounded-xl border border-[var(--hairline)] px-4 py-2 text-sm font-bold text-[color:var(--gold-1)]">
          {busy ? tr(lang, "جارٍ الرفع…", "Uploading…") : url ? tr(lang, "تغيير الصورة", "Change image") : tr(lang, "اختر صورة", "Choose image")}
        </span>
        <input type="file" accept="image/*" onChange={onFile} className="hidden" />
      </label>
      {url && (
        <button
          type="button"
          onClick={() => setUrl("")}
          className="mt-2 text-xs font-bold text-[color:var(--muted)] transition hover:text-[color:var(--danger)]"
        >
          {tr(lang, "🗑 إزالة الصورة", "🗑 Remove image")}
        </button>
      )}
      {err && <p className="mt-1 text-xs text-[color:var(--danger)]">{err}</p>}
    </div>
  );
}
