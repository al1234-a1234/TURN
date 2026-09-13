"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { revokeCampaign } from "./actions";
import { toAr } from "@/lib/format";
import { daysAgoLabel } from "@/lib/dates";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";
import type { Database } from "@/lib/supabase/database.types";

type Campaign = Database["public"]["Functions"]["reward_campaigns_recent"]["Returns"][number];

/**
 * سجلّ آخر الحملات (يدويّة أو الاسترجاع التلقائي الليلي) — يظهر هنا حتى
 * ما أرسلته الأتمتة بلا ضغطة من أحد، لأن المالك اكتشف مرّةً أنه لا يملك
 * طريقةً يراجع بها ما تُرسله ليلًا ويتراجع عن الزائد منه.
 */
export function RecentCampaigns({ campaigns }: { campaigns: Campaign[] }) {
  const lang = useLang();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (campaigns.length === 0) return null;

  return (
    <div className="soft-card p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-sm font-bold text-[color:var(--ink)]"
      >
        <span>{tr(lang, "📜 الحملات الأخيرة", "📜 Recent campaigns")}</span>
        <span className="text-xs text-[color:var(--muted)]">{open ? tr(lang, "إخفاء", "Hide") : tr(lang, "عرض", "Show")}</span>
      </button>

      {open && (
        <ul className="mt-3 space-y-2">
          {campaigns.map((c) => (
            <li key={c.campaign_id} className="rounded-2xl p-3" style={{ background: "var(--surface-2)" }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-[color:var(--ink)]">
                    {c.is_auto ? "🌙 " : "📣 "}
                    {c.title}
                  </p>
                  <p className="mt-0.5 text-xs text-[color:var(--muted)]">
                    {tr(lang, `أُرسلت ${daysAgoLabel(c.created_at, "ar")}`, `Sent ${daysAgoLabel(c.created_at, "en")}`)}
                    {" · "}
                    {tr(
                      lang,
                      `${toAr(c.total_count)} إجمالًا — ${toAr(c.active_count)} نشطة، ${toAr(c.redeemed_count)} مُستخدمة`,
                      `${c.total_count} total — ${c.active_count} active, ${c.redeemed_count} used`,
                    )}
                  </p>
                </div>
                {c.active_count > 0 && (
                  <button
                    type="button"
                    disabled={busyId === c.campaign_id}
                    onClick={async () => {
                      if (
                        !confirm(
                          tr(
                            lang,
                            `تراجع عن ${toAr(c.active_count)} هديّة نشطة من «${c.title}»؟ من استخدمها بالفعل لن يتأثّر.`,
                            `Undo ${c.active_count} active rewards from "${c.title}"? Anyone who already used theirs is unaffected.`,
                          ),
                        )
                      )
                        return;
                      setBusyId(c.campaign_id);
                      await revokeCampaign(c.campaign_id);
                      setBusyId(null);
                      router.refresh();
                    }}
                    className="btn btn-secondary shrink-0 px-3 py-1.5 text-xs"
                  >
                    {busyId === c.campaign_id ? tr(lang, "جارٍ…", "…") : tr(lang, "تراجع", "Undo")}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
