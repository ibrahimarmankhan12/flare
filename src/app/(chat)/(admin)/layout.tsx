import type { ReactNode } from "react";
import { requireAdminPermission } from "auth/permissions";
import { AdminShell } from "@/components/admin/admin-shell";
import { unauthorized } from "next/navigation";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  try {
    await requireAdminPermission();
  } catch (_error) {
    unauthorized();
  }
  return <AdminShell>{children}</AdminShell>;
}