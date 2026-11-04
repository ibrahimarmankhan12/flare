"use client";

import { SidebarGroupLabel, SidebarMenuSub } from "ui/sidebar";
import Link from "next/link";
import { SidebarMenuButton, SidebarMenuSubItem } from "ui/sidebar";
import { SidebarGroupContent, SidebarMenu, SidebarMenuItem } from "ui/sidebar";
import { SidebarGroup } from "ui/sidebar";
import { Plus, Palette } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, useEffect } from "react";

type CanvasSession = {
  id: string;
  createdAt: number;
};

const STORAGE_PREFIX = "flare_canvas_state:";

export function AppSidebarCanvasHistory() {
  const pathname = usePathname();
  const router = useRouter();
  const currentCanvasId = pathname?.match(/\/ecanvas\/([^\/]+)/)?.[1] || null;
  const [, forceUpdate] = useState(0);

  // Refresh when navigating to force re-read localStorage
  useEffect(() => {
    forceUpdate((n) => n + 1);
  }, [pathname]);

  const sessions = useMemo<CanvasSession[]>(() => {
    const canvasIds: CanvasSession[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) {
        const id = key.slice(STORAGE_PREFIX.length);
        if (id) {
          canvasIds.push({
            id,
            createdAt: Date.now(), // localStorage doesn't store timestamps
          });
        }
      }
    }
    return canvasIds.reverse();
  }, [pathname]);

  const handleNewCanvas = () => {
    router.push("/ecanvas");
    router.refresh();
  };

  return (
    <SidebarGroup>
      <SidebarGroupContent className="group-data-[collapsible=icon]:hidden">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarGroupLabel>
              <h4 className="text-xs text-muted-foreground">Canvases</h4>
              <div className="flex-1" />
            </SidebarGroupLabel>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleNewCanvas}
              className="font-semibold mb-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Plus className="size-3.5" />
              <span>New Canvas</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {sessions.length === 0 ? (
          <div className="px-2 py-4 text-center">
            <p className="text-sm text-muted-foreground">No canvases yet</p>
          </div>
        ) : (
          <SidebarMenu>
            {sessions.map((session) => (
              <SidebarMenuSub key={session.id} className="group/canvas mr-0">
                <SidebarMenuSubItem>
                  <div className="flex items-center rounded-lg">
                    <SidebarMenuButton
                      asChild
                      isActive={currentCanvasId === session.id}
                    >
                      <Link
                        href={`/ecanvas/${session.id}`}
                        className="flex items-center gap-2"
                      >
                        <Palette className="size-3.5 shrink-0 text-muted-foreground" />
                        <p className="truncate min-w-0 text-sm">
                          {session.id.slice(0, 8)}...
                        </p>
                      </Link>
                    </SidebarMenuButton>
                  </div>
                </SidebarMenuSubItem>
              </SidebarMenuSub>
            ))}
          </SidebarMenu>
        )}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
