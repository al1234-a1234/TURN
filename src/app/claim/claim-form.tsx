"use client";

import { useActionState } from "react";
import { claimRestaurant, type ClaimState } from "./actions";

export function ClaimForm() {
  const [state, formAction, pending] = useActionState<ClaimState, FormData>(
    claimRestaurant,
    {},
  );

  return (
    <form action={formAction} className="soft-card space-y-5 p-7">
      <div>
        <label htmlFor="code" className="field-label">رمز التسليم</label>
        <input
          id="code"
          name="code"
          required
          dir="ltr"
          autoComplete="off"
          placeholder="ABCD2345"
          className="field-input text-center text-2xl font-extrabold tracking-[0.35em]"
          style={{ textTransform: "uppercase" }}
        />
        <p className="mt-2 text-xs text-[color:var(--muted)]">
          الرمز المكوّن من 8 خانات الذي زوّدك به فريق دور.
        </p>
      </div>

      {state.error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? "جارٍ التحقّق…" : "استلام المطعم"}
      </button>
    </form>
  );
}
