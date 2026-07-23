"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { toAr } from "@/lib/format";

export type NavItem = { key: string; label: string; href: string; icon: string };

function useIsActive() {
  const pathname = usePathname();
  return (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
}

/** قائمة جانبية (ديسكتوب) — تُبرز النشط من المسار بلا إعادة تحميل. */
export function OwnerNavSidebar({ items, counts }: { items: NavItem[]; counts?: Record<string, number> }) {
  const isActive = useIsActive();
  return (
    <nav className="flex-1 space-y-1 p-3">
      {items.map((n) => {
        const on = isActive(n.href);
        const c = counts?.[n.key];
        return (
          <Link
            key={n.key}
            href={n.href}
            prefetch
            data-active={on}
            className="flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-bold transition data-[active=true]:text-white"
            style={on ? { background: "linear-gradient(160deg,#a8371a,#661c0a)" } : { color: "var(--ink)" }}
          >
            <span className="text-base">{n.icon}</span>
            <span className="flex-1">{n.label}</span>
            {c != null && c > 0 && (
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-extrabold"
                style={on ? { background: "rgba(255,255,255,0.25)", color: "#fff" } : { background: "var(--sage)", color: "var(--brand-d)" }}
              >
                {toAr(c)}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** تبويبات أفقية (جوال) — نفس المنطق. */
export function OwnerNavTabs({ items }: { items: NavItem[] }) {
  const isActive = useIsActive();
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((n) => {
        const on = isActive(n.href);
        return (
          <Link
            key={n.key}
            href={n.href}
            prefetch
            data-active={on}
            className="shrink-0 rounded-2xl px-4 py-3 text-center text-sm font-bold text-[color:var(--muted)] transition data-[active=true]:text-white"
            style={on ? { background: "linear-gradient(160deg,#a8371a,#661c0a)" } : { background: "#fff", border: "1px solid var(--border)" }}
          >
            {n.label}
          </Link>
        );
      })}
    </div>
  );
}
