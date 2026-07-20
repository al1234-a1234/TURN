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
      {/* حاوية تبويبات واحدة بزوايا 16px */}
      <div className="mb-6 grid grid-cols-2 gap-1 rounded-2xl border border-[var(--border)] bg-[color:var(--surface)] p-1">
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
                  <h3 className="mb-3 text-lg font-extrabold text-[color:var(--foreground)]">
                    {cat.name}
                  </h3>
                  <ul className="space-y-3">
                    {list.map((it) => (
                      <li key={it.id} className="soft-card flex items-stretch gap-4 p-3">
                        <span className="h-[88px] w-[88px] shrink-0 overflow-hidden rounded-xl bg-[color:var(--surface-2)]">
                          {it.image_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={it.image_url} alt="" className="h-full w-full object-cover" />
                          )}
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <p className="font-bold text-[color:var(--foreground)]">{it.name}</p>
                          {it.description && (
                            <p className="mt-1 line-clamp-2 text-sm leading-6 text-[color:var(--muted)]">
                              {it.description}
                            </p>
                          )}
                          {it.price != null && (
                            <span className="mt-auto self-start pt-2 text-base font-extrabold text-[color:var(--cream)]">
                              {it.price}
                              <span className="mr-1 text-xs font-bold text-[color:var(--muted)]">ر.س</span>
                            </span>
                          )}
                        </div>
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
      className={`rounded-xl py-2.5 text-sm font-bold transition-all duration-200 disabled:opacity-40 ${
        active ? "bg-[color:var(--brand)] text-white" : "text-[color:var(--muted)]"
      }`}
    >
      {children}
    </button>
  );
}
