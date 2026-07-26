import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CustomerShell } from "@/components/customer-shell";
import { TicketView } from "./ticket-view";
import { getLang } from "@/lib/i18n-server";
import { tr } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * تذكرة الدور من رابط مباشر (يُرسله الاستقبال عبر واتساب مع طلب تأكيد الحضور).
 * المعرّف وحده مفتاح الوصول — والدالة لا تُرجع أي بيانات شخصية.
 */
export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const lang = await getLang();
  const { id } = await params;

  const supabase = await createClient();
  const { data } = await supabase.rpc("waitlist_ticket_by_id", { p_entry_id: id });
  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    return (
      <CustomerShell active="other" search={false}>
        <div className="rq-card p-10 text-center">
          <span className="text-4xl">🔎</span>
          <p className="mt-3 text-lg font-bold text-[color:var(--ink)]">{tr(lang, "لم نجد هذا الدور", "Turn not found")}</p>
          <p className="mt-1 text-sm text-[color:var(--muted)]">{tr(lang, "قد يكون الرابط قديمًا أو انتهى الدور.", "The link may be old, or the turn has ended.")}</p>
          <Link href="/" className="rq-btn-soft mt-4 inline-flex">{tr(lang, "تصفّح المطاعم", "Browse restaurants")}</Link>
        </div>
      </CustomerShell>
    );
  }

  return (
    <CustomerShell active="other" search={false}>
      <TicketView entryId={id} initial={row} />
    </CustomerShell>
  );
}
