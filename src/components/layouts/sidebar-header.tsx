"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "ui/sidebar";
import { PanelLeft } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { isShortcutEvent, Shortcuts } from "lib/keyboard-shortcuts";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";
import Image from "next/image";

interface SidebarHeaderSharedProps {
  title: string | React.ReactNode;
  href: string;
  showMobileToggle?: boolean;
  onLinkClick?: () => void;
  enableShortcuts?: boolean;
}

export function SidebarHeaderShared({
  title,
  href,
  showMobileToggle = true,
  onLinkClick,
  enableShortcuts = false,
}: SidebarHeaderSharedProps) {
  const { toggleSidebar, setOpenMobile, open, state } = useSidebar();
  const isMobile = useIsMobile();
  const pathname = usePathname();
  const currentPath = useRef<string | null>(null);
  const isCollapsed = state === "collapsed";

  // Handle shortcuts (only for main app sidebar)
  useEffect(() => {
    if (!enableShortcuts) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isShortcutEvent(e, Shortcuts.toggleSidebar)) {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar, enableShortcuts]);

  useEffect(() => {
    if (pathname === currentPath.current) return;
    if (isMobile) {
      setOpenMobile(false);
    }
    currentPath.current = pathname;
  }, [pathname, isMobile]);

  // When the sidebar is collapsed, clicking the logo expands it.
  const handleLogoClick = (e: React.MouseEvent) => {
    if (isCollapsed) {
      e.preventDefault();
      toggleSidebar();
      return;
    }
    if (onLinkClick) {
      e.preventDefault();
      onLinkClick();
    }
  };

  return (
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem className="flex items-center gap-0.5 mb-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <SidebarMenuButton asChild className="hover:bg-transparent">
                <Link
                  href={href}
                  onClick={handleLogoClick}
                  className="group/logo"
                >
                  {isCollapsed ? (
                    <span
                      className="relative inline-flex items-center justify-center size-7"
                      data-testid="sidebar-logo-collapsed"
                    >
                      <Image
                        src="/flare-logo-512.webp"
                        alt="Flare AI"
                        width={28}
                        height={28}
                        className="rounded-md transition-opacity group-hover/logo:opacity-0"
                      />
                      <button
                        type="button"
                        aria-label="Open sidebar"
                        data-testid="sidebar-toggle-collapsed"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleSidebar();
                        }}
                        className="absolute inset-0 inline-flex items-center justify-center opacity-0 group-hover/logo:opacity-100 transition-opacity rounded-md hover:bg-sidebar-accent text-sidebar-foreground"
                      >
                        <PanelLeft className="size-4" />
                      </button>
                    </span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Image
                        src="/flare-logo-192.webp"
                        alt="Flare AI Logo"
                        width={24}
                        height={24}
                        className="rounded-md object-contain"
                      />
                      <h4 className="font-bold">{title}</h4>
                      <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase bg-primary/10 text-primary rounded-md border border-primary/20">
                        Labs
                      </span>
                    </div>
                  )}
                  {/* Mobile: collapse-to-X icon in the logo row. */}
                  {showMobileToggle && !isCollapsed && isMobile && (
                    <div
                      className="ml-auto"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOpenMobile(false);
                      }}
                      data-state={open ? "open" : "closed"}
                      data-testid="sidebar-header-toggle-mobile"
                    >
                      <PanelLeft className="size-4" />
                    </div>
                  )}
                  {/* Desktop: collapse icon in the logo row, on the right. */}
                  {!isCollapsed && !isMobile && (
                    <button
                      type="button"
                      aria-label="Toggle Sidebar"
                      data-testid="sidebar-toggle"
                      data-state={open ? "open" : "closed"}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleSidebar();
                      }}
                      className="ml-auto inline-flex items-center justify-center rounded-md size-7 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                    >
                      <PanelLeft className="size-4" />
                    </button>
                  )}
                </Link>
              </SidebarMenuButton>
            </TooltipTrigger>
            {isCollapsed && (
              <TooltipContent side="right" align="center">
                {title}
              </TooltipContent>
            )}
          </Tooltip>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
  );
}
