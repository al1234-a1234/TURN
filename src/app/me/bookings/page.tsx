"use client";

import { CustomerShell } from "@/components/customer-shell";
import { RecoverBookings } from "./recover";

/**
 * «دوري وحجزي» — استرجاعٌ بالرقم لا بالجهاز.
 *
 * الصفحة موجودة لأن التخزين المحلّي وحده كان يفقد العميلَ دورَه وحجزه عند
 * إغلاق المتصفّح أو تثبيت التطبيق أو تبديل الجهاز. وهي المكان الوحيد الذي
 * يستطيع فيه إلغاء حجزه بنفسه — وذلك يعيد الطاولة إلى المطعم بدل أن تبقى
 * محجوزةً لمن لن يأتي.
 */
export default function BookingsPage() {
  return (
    <CustomerShell active="other" search={false}>
      <RecoverBookings />
    </CustomerShell>
  );
}
