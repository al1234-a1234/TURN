import { redirect } from "next/navigation";

// المطاعم صارت في الصفحة الرئيسية مباشرةً (تجربة العميل)
export default function RestaurantsPage() {
  redirect("/");
}
