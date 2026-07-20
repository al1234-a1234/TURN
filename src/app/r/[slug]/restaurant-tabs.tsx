"use client";

import { useState } from "react";

type Item = {
  id: string;
  name: string;
  price: number | null;
  description: string | null;
  image_url: string | null;
  category_id: string;
};
type Category = { id: string; name: string };

export function RestaurantTabs({
  categories,
  items,
  children,
}: {
  categories: Category[];
  items: Item[];
  children: React.ReactNode;
}) {
  const hasMenu = categories.length > 0;
  const [tab, setTab] = useState<"waitlist" | "menu">("waitlist");

  return (
    <div>
      <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl bg-sand-100 p-1.5 dark:bg-stone-800/50">
        <TabBtn active={tab === "waitlist"} onClick={() => setTab("waitlist")}>
          قائمة الانتظار
        </TabBtn>
        <TabBtn active={tab === "menu"} onClick={() => setTab("menu")} disabled={!hasMenu}>
          المنيو
        </TabBtn>
      </div>

      <div className={tab === "waitlist" ? "" : "hidden"}>{children}</div>

      <div className={tab === "menu" ? "" : "hidden"}>
        {!hasMenu ? (
          <div className="soft-card p-8 text-center text-sm text-[color:var(--muted)]">
            لا يوجد منيو بعد.
          </div>
        ) : (
          <div className="space-y-6">
            {categories.map((cat) => {
              const list = items.filter((i) => i.category_id === cat.id);
              if (list.length === 0) return null;
              return (
                <div key={cat.id}>
                  <h3 className="mb-3 text-lg font-extrabold text-brand-800 dark:text-cream-100">
                    {cat.name}
                  </h3>
                  <ul className="space-y-3">
                    {list.map((it) => (
                      <li key={it.id} className="soft-card flex items-center gap-4 p-3">
                        <span className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-sand-100 dark:bg-stone-800">
                          {it.image_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={it.image_url} alt="" className="h-full w-full object-cover" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold">{it.name}</p>
                          {it.description && (
                            <p className="mt-0.5 line-clamp-2 text-sm text-[color:var(--muted)]">
                              {it.description}
                            </p>
                          )}
                        </div>
                        {it.price != null && (
                          <span className="shrink-0 font-extrabold text-brand-700 dark:text-brand-300">
                            {it.price}
                            <span className="mr-1 text-xs font-normal text-[color:var(--muted)]">ر.س</span>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function TabBtn({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl py-2.5 text-sm font-bold transition disabled:opacity-40 ${
        active
          ? "bg-[var(--surface)] text-brand-700 shadow-[var(--shadow-soft)] dark:text-brand-300"
          : "text-[color:var(--muted)]"
      }`}
    >
      {children}
    </button>
  );
}
