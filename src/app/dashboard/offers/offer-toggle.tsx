"use client";

import { useState, useTransition } from "react";
import { toggleOffer } from "./actions";

export function OfferToggle({ id, active }: { id: string; active: boolean }) {
  const [on, setOn] = useState(active);
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const next = !on;
          setOn(next);
          await toggleOffer(id, next);
        })
      }
      className="relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-60"
      style={{ background: on ? "linear-gradient(160deg,#a8371a,#661c0a)" : "var(--surface-2)", border: "1px solid var(--border)" }}
      title={on ? "مُفعّل" : "متوقّف"}
    >
      <span
        className="absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow transition-all"
        style={{ insetInlineStart: on ? "1.55rem" : "0.2rem" }}
      />
    </button>
  );
}
