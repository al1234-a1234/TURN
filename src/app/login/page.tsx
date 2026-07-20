import { redirect } from "next/navigation";

// دخول الملّاك انتقل إلى بوابة الشركاء المنفصلة
export default function LoginRedirect() {
  redirect("/partners");
}
