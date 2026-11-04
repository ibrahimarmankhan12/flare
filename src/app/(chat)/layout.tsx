import { SidebarProvider } from "ui/sidebar";
import { AppSidebar } from "@/components/layouts/app-sidebar";
import { AppHeader } from "@/components/layouts/app-header";
import { cookies } from "next/headers";

import { getSession } from "lib/auth/server";
import { COOKIE_KEY_SIDEBAR_STATE } from "lib/const";
import { AppPopupProvider } from "@/components/layouts/app-popup-provider";
import { SWRConfigProvider } from "./swr-config";
import { UserDetailContent } from "@/components/user/user-detail/user-detail-content";
import { UserDetailContentSkeleton } from "@/components/user/user-detail/user-detail-content-skeleton";
import { WarningBanner } from "@/components/warning-banner";
import { CanvasPanelWrapper } from "@/components/canvas/canvas-panel-wrapper";
import { userRepository } from "lib/db/repository";

import { Suspense } from "react";
import { redirect } from "next/navigation";
export const experimental_ppr = true;

export default async function ChatLayout({
  children,
}: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const session = await getSession();
  if (!session) {
    redirect("/sign-in");
  }

  const dbUser = await userRepository.getUserById(session.user.id);
  const effectiveUser = dbUser ?? session.user;

  const isCollapsed =
    cookieStore.get(COOKIE_KEY_SIDEBAR_STATE)?.value !== "true";
  return (
    <SidebarProvider defaultOpen={!isCollapsed}>
      <SWRConfigProvider user={session.user}>
        <AppPopupProvider
          userSettingsComponent={
            <Suspense fallback={<UserDetailContentSkeleton />}>
              <UserDetailContent view="user" />
            </Suspense>
          }
        />
        <AppSidebar user={effectiveUser} />
        <main className="relative bg-background w-full flex flex-col h-screen overflow-hidden">
          <WarningBanner />
          <AppHeader user={effectiveUser} />
          <div className="flex flex-1 min-h-0 overflow-hidden">
            <div className="scrollbar-slim flex-1 min-h-0 overflow-y-auto">
              {children}
            </div>
            <CanvasPanelWrapper />
          </div>
        </main>
      </SWRConfigProvider>
    </SidebarProvider>
  );
}
