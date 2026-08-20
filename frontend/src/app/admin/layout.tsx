import type { ReactNode } from "react";
import AdminGate from "@/components/admin/AdminGate";

export const metadata = {
  title: "Admin — MOLA Timing",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminGate>{children}</AdminGate>;
}
