"use client";
import { Sidebar, SidebarContent, SidebarFooter } from "ui/sidebar";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { AppSidebarMenus } from "./app-sidebar-menus";
import { AppSidebarAgents } from "./app-sidebar-agents";
import { AppSidebarThreads } from "./app-sidebar-threads";
import { AppSidebarCanvasHistory } from "./app-sidebar-canvas-history";
import { usePathname } from "next/navigation";
import { SidebarHeaderShared } from "./sidebar-header";

import { isShortcutEvent, Shortcuts } from "lib/keyboard-shortcuts";
import { AppSidebarUser } from "./app-sidebar-user";
import { BasicUser } from "app-types/user";

export function AppSidebar({
  user,
}: {
  user?: BasicUser;
}) {
  const userRole = user?.role;
  const router = useRouter();
  const pathname = usePathname();

  // Handle new chat shortcut (specific to main app)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isShortcutEvent(e, Shortcuts.openNewChat)) {
        e.preventDefault();
        router.push("/dashboard");
        router.refresh();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  return (
    <Sidebar collapsible="icon" variant="floating">
      <SidebarHeaderShared
        title="Flare AI"
        href="/dashboard"
        enableShortcuts={true}
        onLinkClick={() => {
          router.push("/dashboard");
          router.refresh();
        }}
      />

      <SidebarContent className="mt-2 overflow-hidden relative">
        <div className="flex h-full min-h-0 flex-col">
          <AppSidebarMenus user={user} />
          <AppSidebarAgents userRole={userRole} />
          <div className="sidebar-history-scroll min-h-0 flex-1 overflow-y-auto pr-1">
            {pathname?.startsWith("/ecanvas") ||
            pathname?.startsWith("/canvas") ? (
              <AppSidebarCanvasHistory />
            ) : (
              <AppSidebarThreads />
            )}
          </div>
        </div>
      </SidebarContent>
      <SidebarFooter className="flex flex-col items-stretch space-y-2">
        <AppSidebarUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
