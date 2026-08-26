"use client";

import { useRef } from "react";
import { adminDeleteRestaurant } from "./actions";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

/**
 * حذفٌ لا رجوع فيه — يطلب كتابة معرّف الرابط حرفيًّا قبل الإرسال، لا مجرّد
 * تأكيد نقرة. اسم المطعم ذاته ليس فريدًا ولا يُكتب بصيغةٍ واحدة دومًا؛
 * الرابط (slug) هو المعرّف الذي يراه الأدمن في نفس الصفّ فيقارنه بعينه.
 */
export function DeleteRestaurantButton({ restaurantId, slug }: { restaurantId: string; slug: string }) {
  const lang = useLang();
  const formRef = useRef<HTMLFormElement>(null);

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    const typed = window.prompt(
      tr(
        lang,
        `حذفٌ نهائي — لا رجوع فيه، وتُحذف حسابات موظّفيه/مالكه المرتبطة به وحده معه.\nاكتب "${slug}" للتأكيد:`,
        `Permanent delete — no undo, and its solo staff/owner accounts go with it.\nType "${slug}" to confirm:`,
      ),
    );
    if (typed === slug) formRef.current?.requestSubmit();
  }

  return (
    <form ref={formRef} action={adminDeleteRestaurant} className="shrink-0">
      <input type="hidden" name="restaurant_id" value={restaurantId} />
      <button
        type="button"
        onClick={handleClick}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[rgba(200,70,70,0.3)] bg-[rgba(200,70,70,0.06)] text-[color:var(--danger)] transition"
        title={tr(lang, "حذف المطعم — نهائي", "Delete restaurant — permanent")}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </form>
  );
}
