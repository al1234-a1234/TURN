"use client";

import { useState, useTransition } from "react";
import { ImageUploader } from "@/components/image-uploader";
import {
  addMenuCategory,
  addMenuItem,
  deleteMenuCategory,
  deleteMenuItem,
} from "./actions";

type Item = {
  id: string;
  name: string;
  price: number | null;
  description: string | null;
  image_url: string | null;
  category_id: string;
};
type Category = { id: string; name: string };

export function MenuManager({
  restaurantId,
  categories,
  items,
}: {
  restaurantId: string;
  categories: Category[];
  items: Item[];
}) {
  return (
    <div className="space-y-4">
      <form action={addMenuCategory} className="soft-card flex items-end gap-3 p-4">
        <div className="flex-1">
          <label className="field-label">إضافة فئة جديدة</label>
          <input name="name" required placeholder="مثال: المقبلات الباردة" className="field-input" />
        </div>
        <button className="btn btn-primary shrink-0 px-5">إضافة</button>
      </form>

      {categories.length === 0 ? (
        <div className="soft-card p-8 text-center text-sm text-[color:var(--muted)]">
          ابدأ بإضافة فئة (مثل: المقبلات، الأطباق الرئيسية…) ثم أضف الأصناف بصورها.
        </div>
      ) : (
        categories.map((cat) => (
          <CategoryBlock
            key={cat.id}
            category={cat}
            restaurantId={restaurantId}
            items={items.filter((i) => i.category_id === cat.id)}
          />
        ))
      )}
    </div>
  );
}

function CategoryBlock({
  category,
  restaurantId,
  items,
}: {
  category: Category;
  restaurantId: string;
  items: Item[];
}) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  return (
    <div className="soft-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-extrabold text-brand-800 dark:text-cream-100">{category.name}</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-bold text-white"
          >
            {open ? "إغلاق" : "+ صنف"}
          </button>
          <button
            onClick={() => start(() => deleteMenuCategory(category.id))}
            disabled={pending}
            className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs font-bold text-[color:var(--muted)] hover:text-red-600"
          >
            حذف الفئة
          </button>
        </div>
      </div>

      {open && (
        <form action={addMenuItem} className="mt-4 space-y-3 rounded-2xl bg-sand-100 p-4 dark:bg-stone-800/40">
          <input type="hidden" name="category_id" value={category.id} />
          <ImageUploader restaurantId={restaurantId} name="image_url" label="صورة الصنف" />
          <div className="grid gap-3 sm:grid-cols-2">
            <input name="name" required placeholder="اسم الصنف" className="field-input" />
            <input name="price" inputMode="decimal" placeholder="السعر (ر.س)" className="field-input" />
          </div>
          <textarea name="description" rows={2} placeholder="الوصف (اختياري)" className="field-input" />
          <button className="btn btn-primary w-full">إضافة الصنف</button>
        </form>
      )}

      <ul className="mt-3 space-y-2">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-3 rounded-2xl border border-[var(--border)] p-2">
            <span className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-sand-100 dark:bg-stone-800">
              {it.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.image_url} alt="" className="h-full w-full object-cover" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{it.name}</p>
              <p className="truncate text-xs text-[color:var(--muted)]">{it.description}</p>
            </div>
            {it.price != null && (
              <span className="shrink-0 text-sm font-bold text-brand-700 dark:text-brand-300">
                {it.price} ر.س
              </span>
            )}
            <ItemDelete id={it.id} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ItemDelete({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(() => deleteMenuItem(id))}
      disabled={pending}
      className="shrink-0 rounded-lg px-2 py-1 text-xs text-[color:var(--muted)] hover:text-red-600"
      aria-label="حذف"
    >
      ✕
    </button>
  );
}
