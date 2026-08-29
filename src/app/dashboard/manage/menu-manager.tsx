"use client";

import { useActionState, useState, useTransition } from "react";
import Image from "next/image";
import { ImageUploader } from "@/components/image-uploader";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";
import {
  addMenuCategory,
  addMenuItem,
  deleteMenuCategory,
  deleteMenuItem,
  updateMenuCategoryTranslation,
  updateMenuItemTranslation,
} from "./actions";

type Item = {
  id: string;
  name: string;
  name_en: string | null;
  price: number | null;
  description: string | null;
  description_en: string | null;
  image_url: string | null;
  category_id: string;
};
type Category = { id: string; name: string; name_en: string | null };

export function MenuManager({
  restaurantId,
  branchId,
  categories,
  items,
}: {
  restaurantId: string;
  branchId: string;
  categories: Category[];
  items: Item[];
}) {
  const lang = useLang();
  const [catState, catAction] = useActionState(addMenuCategory, null);
  return (
    <div className="space-y-4">
      <form action={catAction} className="soft-card p-4">
        <input type="hidden" name="branch_id" value={branchId} />
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="field-label">{tr(lang, "إضافة فئة جديدة", "Add new category")}</label>
            {/* الفئة ليست طبقًا — والخلط بينهما كلّف المالك قائمةً فارغة:
                أُنشئ «سيزر سلط» فئةً ثمّ استُغرب أنّها بلا صورة ولا سعر. */}
            <p className="mb-1.5 text-xs font-semibold" style={{ color: "var(--muted)" }}>
              {tr(lang,
                "الفئة مجموعةٌ تضمّ أطباقًا (مقبّلات، مشاوي…) — وليست طبقًا. الأطباق تُضاف داخلها بزرّ «+ صنف».",
                "A category groups dishes (Appetizers, Grills…) — it is not a dish. Add dishes inside it with “+ Item”.")}
            </p>
            <input name="name" required placeholder={tr(lang, "مثال: المقبلات الباردة", "e.g. Cold appetizers")} className="field-input" />
            <input name="name_en" dir="ltr" placeholder={tr(lang, "بالإنجليزية (اختياري)", "In English (optional)")} className="field-input mt-2" />
          </div>
          <button className="btn btn-primary shrink-0 px-5">{tr(lang, "إضافة", "Add")}</button>
        </div>
        {catState?.error && (
          <p className="mt-2 text-xs font-bold" style={{ color: "var(--danger)" }}>{catState.error}</p>
        )}
      </form>

      {categories.length === 0 ? (
        <div className="soft-card p-8 text-center text-sm text-[color:var(--muted)]">
          {tr(lang, "ابدأ بإضافة فئة (مثل: المقبلات، الأطباق الرئيسية…) ثم أضف الأصناف بصورها.", "Start by adding a category (e.g. Appetizers, Main dishes…) then add items with their photos.")}
        </div>
      ) : (
        categories.map((cat) => (
          <CategoryBlock
            key={cat.id}
            category={cat}
            restaurantId={restaurantId}
            branchId={branchId}
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
  branchId,
  items,
}: {
  category: Category;
  restaurantId: string;
  branchId: string;
  items: Item[];
}) {
  const lang = useLang();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [itemState, itemAction] = useActionState(addMenuItem, null);

  return (
    <div className="soft-card p-4">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-extrabold text-brand-800 dark:text-cream-100">{category.name}</h3>
          {category.name_en ? (
            <p className="truncate text-xs text-[color:var(--muted)]" dir="ltr">{category.name_en}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTranslating((v) => !v)}
            className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs font-bold text-[color:var(--muted)]"
          >
            EN
          </button>
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-bold text-cream-100"
          >
            {open ? tr(lang, "إغلاق", "Close") : tr(lang, "+ صنف", "+ Item")}
          </button>
          <button
            onClick={() => start(() => deleteMenuCategory(category.id))}
            disabled={pending}
            className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs font-bold text-[color:var(--muted)] hover:text-[color:var(--danger)]"
          >
            {tr(lang, "حذف الفئة", "Delete category")}
          </button>
        </div>
      </div>

      {translating && (
        <form
          action={updateMenuCategoryTranslation}
          onSubmit={() => setTranslating(false)}
          className="mt-3 flex items-end gap-2 rounded-2xl bg-sand-100 p-3"
        >
          <input type="hidden" name="category_id" value={category.id} />
          <div className="min-w-0 flex-1">
            <label className="field-label">{tr(lang, "اسم الفئة بالإنجليزية", "Category name in English")}</label>
            <input
              name="name_en"
              dir="ltr"
              defaultValue={category.name_en ?? ""}
              placeholder={tr(lang, "اتركه فارغًا ليُعرض الاسم العربي", "Leave empty to show the Arabic name")}
              className="field-input"
            />
          </div>
          <button className="btn btn-primary shrink-0 px-5">{tr(lang, "حفظ", "Save")}</button>
        </form>
      )}

      {open && (
        <form action={itemAction} className="mt-4 space-y-3 rounded-2xl bg-sand-100 p-4 ">
            <input type="hidden" name="branch_id" value={branchId} />
          <input type="hidden" name="category_id" value={category.id} />
          <ImageUploader restaurantId={restaurantId} name="image_url" label={tr(lang, "صورة الصنف", "Item image")} />
          <div className="grid gap-3 sm:grid-cols-2">
            <input name="name" required placeholder={tr(lang, "اسم الصنف", "Item name")} className="field-input" />
            <input name="name_en" dir="ltr" placeholder={tr(lang, "الاسم بالإنجليزية (اختياري)", "English name (optional)")} className="field-input" />
            <input name="price" inputMode="decimal" placeholder={tr(lang, "السعر (ر.س)", "Price (SAR)")} className="field-input" />
          </div>
          <textarea name="description" rows={2} placeholder={tr(lang, "الوصف (اختياري)", "Description (optional)")} className="field-input" />
          <textarea name="description_en" rows={2} dir="ltr" placeholder={tr(lang, "الوصف بالإنجليزية (اختياري)", "English description (optional)")} className="field-input" />
          {itemState?.error && (
            <p className="text-xs font-bold" style={{ color: "var(--danger)" }}>{itemState.error}</p>
          )}
          <button className="btn btn-primary w-full">{tr(lang, "إضافة الصنف", "Add item")}</button>
        </form>
      )}

      <ul className="mt-3 space-y-2">
        {items.map((it) => (
          <ItemRow key={it.id} item={it} />
        ))}
      </ul>
    </div>
  );
}

function ItemRow({ item }: { item: Item }) {
  const lang = useLang();
  const [translating, setTranslating] = useState(false);
  // «EN» بدل «ترجمة»: الزرّ نفسه يقول أيّ لغةٍ يفتح، ويقرأه المالك ولو
  // كانت لوحته بالعربية. والنقطة الذهبية علامة نقصٍ لا خطأ — تدلّ المالك
  // على ما لم يُترجَم بعد بلا أن تصرخ في وجهه بأحمر.
  const missing = !item.name_en;
  return (
    <li className="rounded-2xl border border-[var(--border)] p-2">
      <div className="flex items-center gap-3">
        <span className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-sand-100 ">
          {item.image_url && (
            <Image src={item.image_url} alt="" width={96} height={96} sizes="96px" className="h-full w-full object-cover" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{item.name}</p>
          {item.name_en ? (
            <p className="truncate text-xs text-[color:var(--muted)]" dir="ltr">{item.name_en}</p>
          ) : (
            <p className="truncate text-xs text-[color:var(--muted)]">{item.description}</p>
          )}
        </div>
        {item.price != null && (
          <span className="shrink-0 text-sm font-bold text-brand-700 dark:text-brand-300">
            {item.price} {tr(lang, "ر.س", "SAR")}
          </span>
        )}
        <button
          onClick={() => setTranslating((v) => !v)}
          className="relative shrink-0 rounded-lg border border-[var(--border)] px-2 py-1 text-[11px] font-bold text-[color:var(--muted)]"
          title={tr(lang, "الترجمة الإنجليزية", "English translation")}
        >
          EN
          {missing && (
            <span className="absolute -end-1 -top-1 h-2 w-2 rounded-full" style={{ background: "var(--gold-1)" }} aria-hidden />
          )}
        </button>
        <ItemDelete id={item.id} />
      </div>

      {translating && (
        <form
          action={updateMenuItemTranslation}
          onSubmit={() => setTranslating(false)}
          className="mt-2 space-y-2 rounded-xl bg-sand-100 p-3"
        >
          <input type="hidden" name="item_id" value={item.id} />
          <input
            name="name_en"
            dir="ltr"
            defaultValue={item.name_en ?? ""}
            placeholder={tr(lang, "اسم الصنف بالإنجليزية", "Item name in English")}
            className="field-input"
          />
          <textarea
            name="description_en"
            rows={2}
            dir="ltr"
            defaultValue={item.description_en ?? ""}
            placeholder={tr(lang, "الوصف بالإنجليزية", "Description in English")}
            className="field-input"
          />
          <p className="text-xs text-[color:var(--muted)]">
            {tr(
              lang,
              "الفراغ يعني «اعرض العربية» — لا سطرًا خاليًا في قائمة العميل.",
              "Empty means “show the Arabic” — never a blank line in the guest's menu.",
            )}
          </p>
          <button className="btn btn-primary w-full">{tr(lang, "حفظ الترجمة", "Save translation")}</button>
        </form>
      )}
    </li>
  );
}

function ItemDelete({ id }: { id: string }) {
  const lang = useLang();
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(() => deleteMenuItem(id))}
      disabled={pending}
      className="shrink-0 rounded-lg px-2 py-1 text-xs text-[color:var(--muted)] hover:text-[color:var(--danger)]"
      aria-label={tr(lang, "حذف", "Delete")}
    >
      ✕
    </button>
  );
}
