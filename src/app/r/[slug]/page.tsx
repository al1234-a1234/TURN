import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function RestaurantPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id, name, name_en, description, logo_url, is_active")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (!restaurant) {
    notFound();
  }

  const { data: branches } = await supabase
    .from("branches")
    .select("id, name, city, address, phone")
    .eq("restaurant_id", restaurant.id)
    .eq("is_active", true)
    .order("created_at");

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="text-xl font-extrabold text-teal-700 dark:text-teal-400"
          >
            دور
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium text-teal-600 hover:underline"
          >
            حجوزاتي
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold">{restaurant.name}</h1>
          {restaurant.name_en && (
            <p className="mt-1 text-zinc-400" dir="ltr">
              {restaurant.name_en}
            </p>
          )}
          {restaurant.description && (
            <p className="mt-3 max-w-prose leading-8 text-zinc-600 dark:text-zinc-300">
              {restaurant.description}
            </p>
          )}
        </div>

        <h2 className="mb-4 text-lg font-semibold">الفروع</h2>
        {branches && branches.length > 0 ? (
          <ul className="space-y-3">
            {branches.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div>
                  <p className="font-semibold">{b.name}</p>
                  <p className="text-sm text-zinc-500">
                    {[b.city, b.address].filter(Boolean).join(" · ") ||
                      "بدون عنوان"}
                  </p>
                </div>
                <Link
                  href={`/login?redirect=/r/${slug}`}
                  className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-700"
                >
                  احجز الآن
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-400 dark:border-zinc-700">
            لا توجد فروع متاحة حاليًا.
          </p>
        )}
      </main>
    </div>
  );
}
