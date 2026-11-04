"use client";

import { ReactNode } from "react";
import { AdminSidebar } from "@/components/admin/admin-sidebar";

interface Props {
  children: ReactNode;
}

export function AdminShell({ children }: Props) {
  return <AdminSidebar>{children}</AdminSidebar>;
}