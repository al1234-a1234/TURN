import { redirect } from "next/navigation";
import { OwnerShell } from "../owner-shell";
import { loadOwner } from "../owner-context";
import { staffHasPermission } from "@/lib/features";
import { saveLinks } from "./actions";
import { tr } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";

export default async function ContentPage() {
  const lang = await getLang();
  const load = await loadOwner();
  if (load.state !== "ok") redirect("/dashboard");
  const { supabase, restaurant, modules, role, permissions } = load.ctx;

  if (!staffHasPermission(role, permissions, "settings")) redirect("/dashboard");

  const { data: r } = await supabase
    .from("restaurants")
    .select("links")
    .eq("id", restaurant.id)
    .maybeSingle();
  const links = (r?.links ?? {}) as Record<string, string>;

  const fields: { key: string; label: string; placeholder?: string }[] = [
    { key: "maps", label: tr(lang, "رابط خرائط Google", "Google Maps link") },
    { key: "instagram", label: tr(lang, "إنستغرام", "Instagram") },
    { key: "x", label: tr(lang, "إكس (تويتر)", "X (Twitter)") },
    { key: "tiktok", label: tr(lang, "تيك توك", "TikTok") },
    { key: "snapchat", label: tr(lang, "سناب شات", "Snapchat") },
    { key: "whatsapp", label: tr(lang, "رقم/رابط واتساب", "WhatsApp number/link") },
    { key: "website", label: tr(lang, "الموقع الإلكتروني", "Website") },
  ];

  return (
    <OwnerShell active="content" restaurant={restaurant} modules={modules} role={role} permissions={permissions}>
      <div className="mb-5 hidden lg:block">
        <h1 className="font-display text-3xl font-bold text-[color:var(--ink)]">{tr(lang, "المحتوى والروابط", "Content & Links")}</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">{tr(lang, "روابط مطعمك العامة على الخرائط ومنصات التواصل", "Your restaurant's public links on maps and social platforms")}</p>
      </div>

      <section className="soft-card p-5">
        <h2 className="mb-1 font-display text-lg font-bold text-[color:var(--ink)]">{tr(lang, "الروابط العامة", "Public links")}</h2>
        <p className="mb-4 text-sm text-[color:var(--muted)]">{tr(lang, "تظهر هذه الروابط لعملائك في صفحة مطعمك العامة.", "These links appear to your customers on your public restaurant page.")}</p>
        <form action={saveLinks} className="space-y-4">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="field-label">{f.label}</label>
              <input name={f.key} defaultValue={links[f.key] ?? ""} className="field-input" />
            </div>
          ))}
          <button className="btn btn-primary w-full">{tr(lang, "حفظ الروابط", "Save links")}</button>
        </form>
      </section>
    </OwnerShell>
  );
}
