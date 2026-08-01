"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

/**
 * تبويبات الفروع للاستقبال — كل فرع قسم مستقل تمامًا (نمط ريكيو).
 * يبدّل الفرع النشِط عبر ?branch=<id> مع تحديث ناعم (بلا إعادة تحميل كامل)،
 * فيبقى التحديث التلقائي شغّالًا على الفرع المختار فقط.
 */
export function BranchTabs({
  branches,
  activeId,
}: {
  branches: { id: string; name: string; city?: string | null }[];
  activeId: string;
}) {
  const lang = useLang();
  const router = useRouter();
  const params = useSearchParams();

  function select(id: string) {
    if (id === activeId) return;
    const next = new URLSearchParams(params.toString());
    next.set("branch", id);
    router.replace(`/dashboard/reception?${next.toString()}`);
    router.refresh();
  }

  return (
    <div className="mb-5">
      <p className="mb-2 px-1 text-xs font-bold text-[color:var(--muted)]">{tr(lang, "الفرع", "Branch")}</p>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {branches.map((b) => {
          const active = b.id === activeId;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => select(b.id)}
              data-active={active}
              className="shrink-0 rounded-2xl px-4 py-2.5 text-right transition active:scale-[0.97]"
              style={
                active
                  ? { background: "var(--brand-solid)", color: "var(--brand-ink)", boxShadow: "0 12px 24px -16px rgba(102,28,10,0.72)" }
                  : { background: "var(--surface-2)", color: "var(--ink)", border: "1px solid rgba(102,28,10,0.12)" }
              }
            >
              <span className="block text-sm font-extrabold">{b.name}</span>
              {b.city ? (
                <span className="block text-[11px] font-bold" style={{ color: active ? "rgba(255,255,255,0.82)" : "var(--muted)" }}>
                  {b.city}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
