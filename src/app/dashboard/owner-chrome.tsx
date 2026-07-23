import Link from "next/link";
import { BrandLink } from "@/components/brand";
import { tr } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";

export async function OwnerHeader({
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
  const lang = await getLang();
  return (
    <header className="app-header px-5 pb-12 pt-5">
      <div className="mx-auto flex max-w-3xl items-center justify-between">
        <BrandLink href="/dashboard" size={38} />
        <div className="flex items-center gap-2">
          {slug && (
            <Link href={`/r/${slug}`} className="icon-btn" title={tr(lang, "الصفحة العامة", "Public Page")}>
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
          <p className="text-xs font-bold tracking-[0.3em] text-cream-200/85">{tr(lang, "لوحة المطعم", "Restaurant Panel")}</p>
          <h1 className="mt-1 font-display text-3xl font-bold">{title}</h1>
        </div>
      )}
      {!title && email && (
        <p className="mx-auto mt-4 max-w-3xl text-sm text-white/80" dir="ltr">{email}</p>
      )}
    </header>
  );
}

