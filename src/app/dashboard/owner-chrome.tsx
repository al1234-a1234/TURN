import Link from "next/link";
import { BrandLink } from "@/components/brand";

export function OwnerHeader({
  title,
  slug,
  email,
  actions,
}: {
  title?: string;
  slug?: string;
  email?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="app-header px-5 pb-12 pt-5">
      <div className="mx-auto flex max-w-3xl items-center justify-between">
        <BrandLink href="/dashboard" size={38} />
        <div className="flex items-center gap-2">
          {slug && (
            <Link href={`/r/${slug}`} className="icon-btn" title="الصفحة العامة">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M14 3h7v7M21 3l-9 9M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          )}
          {actions}
        </div>
      </div>
      {title && (
        <div className="mx-auto mt-6 max-w-3xl">
          <p className="text-xs font-bold tracking-[0.3em] text-cream-200/85">لوحة المطعم</p>
          <h1 className="mt-1 font-display text-3xl font-bold">{title}</h1>
        </div>
      )}
      {!title && email && (
        <p className="mx-auto mt-4 max-w-3xl text-sm text-white/80" dir="ltr">{email}</p>
      )}
    </header>
  );
}

export function OwnerTabs({ active }: { active: "reception" | "manage" }) {
  return (
    <div className="mb-5 grid grid-cols-2 gap-1 rounded-2xl bg-white p-1 shadow-[0_10px_24px_-18px_rgba(20,45,32,0.3)]" style={{ border: "1px solid var(--border)" }}>
      <Link
        href="/dashboard"
        data-active={active === "reception"}
        className="rounded-xl py-3 text-center text-sm font-bold text-[color:var(--muted)] data-[active=true]:text-white"
        style={active === "reception" ? { background: "linear-gradient(160deg,#a8371a,#661c0a)" } : undefined}
      >
        الاستقبال
      </Link>
      <Link
        href="/dashboard/manage"
        data-active={active === "manage"}
        className="rounded-xl py-3 text-center text-sm font-bold text-[color:var(--muted)] data-[active=true]:text-white"
        style={active === "manage" ? { background: "linear-gradient(160deg,#a8371a,#661c0a)" } : undefined}
      >
        الإدارة والتحليلات
      </Link>
    </div>
  );
}
