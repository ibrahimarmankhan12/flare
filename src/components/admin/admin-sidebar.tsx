"use client";

import { ReactNode, useState, useEffect, useRef } from "react";
import {
  BotIcon,
  WrenchIcon,
  BoxIcon,
  SparklesIcon,
  Settings2Icon,
  ChevronLeft,
  ChevronRight,
  LayoutDashboardIcon,
  UsersIcon,
  ShieldIcon,
  HistoryIcon,
  Mail,
  Palette,
  KeyRound,
  Server,
  MessageSquare,
  Globe,
  CreditCard,
  Moon,
  Sun,
  Monitor,
  Menu,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";

const CONFIG_TABS = [
  { id: "models", label: "Models", icon: BotIcon, href: "/admin/settings/models" },
  { id: "tools", label: "Tools", icon: WrenchIcon, href: "/admin/settings/tools" },
  { id: "canvas", label: "Canvas", icon: BoxIcon, href: "/admin/settings/canvas" },
  { id: "artifacts", label: "Artifacts", icon: SparklesIcon, href: "/admin/settings/artifacts" },
  { id: "branding", label: "Branding", icon: Palette, href: "/admin/settings/branding" },
  { id: "email", label: "Email", icon: Mail, href: "/admin/settings/email" },
  { id: "oauth", label: "OAuth", icon: KeyRound, href: "/admin/settings/oauth" },
  { id: "security", label: "Security", icon: ShieldIcon, href: "/admin/settings/security" },
  { id: "mcp", label: "MCP", icon: Server, href: "/admin/settings/mcp" },
  { id: "chat", label: "Chat", icon: MessageSquare, href: "/admin/settings/chat" },
  { id: "community", label: "Community", icon: Globe, href: "/admin/settings/community" },
  { id: "payments", label: "Payments", icon: CreditCard, href: "/admin/settings/payments" },
  { id: "general", label: "General", icon: Settings2Icon, href: "/admin/settings/general" },
];

interface Props {
  children: ReactNode;
}

export function AdminSidebar({ children }: Props) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme, resolvedTheme } = useTheme();
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCollapsed(localStorage.getItem("admin-sidebar-collapsed") === "true");
    setMounted(true);
  }, []);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("admin-sidebar-collapsed", String(next));
  };

  // Cycle light -> dark -> system -> light so admins can pick the system mode too.
  const cycleTheme = () => {
    const next =
      theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setTheme(next);
  };

  const effectiveTheme = theme === "system" ? resolvedTheme : theme;
  const themeAriaLabel =
    theme === "system"
      ? "System theme (currently " + (resolvedTheme ?? "light") + ")"
      : theme === "dark"
        ? "Switch to system theme"
        : "Switch to dark theme";
  const themeTitle =
    theme === "system" ? "System" : theme === "dark" ? "Dark" : "Light";

  const activeConfigTab = CONFIG_TABS.find((t) => pathname.includes(`/${t.id}`));
  const crumb2 = activeConfigTab ? "Configuration" : pathname.startsWith("/admin/users") ? "Users" : pathname.startsWith("/admin/health") ? "Health" : pathname.startsWith("/admin/audit") ? "Audit Log" : "Dashboard";

  const sidebar = (
    <div
      className={`border-r border-border bg-muted/20 flex flex-col py-4 shrink-0 transition-all duration-200 ${
        collapsed ? "w-14" : "w-56"
      } ${mobileOpen ? "relative z-50" : ""}`}
    >
      <div className="px-3 mb-4 flex items-center justify-between">
        {!collapsed && (
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Admin
          </span>
        )}
        <div className="flex items-center gap-1 ml-auto">
          {/* Theme toggle — cycles light -> dark -> system */}
          <button
            onClick={cycleTheme}
            className="p-1.5 rounded hover:bg-muted transition-colors"
            aria-label={themeAriaLabel}
            title={themeTitle}
          >
            {mounted ? (
              theme === "system" ? (
                <Monitor className="size-4 text-muted-foreground" />
              ) : effectiveTheme === "dark" ? (
                <Sun className="size-4 text-muted-foreground" />
              ) : (
                <Moon className="size-4 text-muted-foreground" />
              )
            ) : (
              <Moon className="size-4 text-muted-foreground" />
            )}
          </button>
          <button
            onClick={toggleCollapsed}
            className="p-1.5 rounded hover:bg-muted transition-colors"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="size-4 text-muted-foreground" />
            ) : (
              <ChevronLeft className="size-4 text-muted-foreground" />
            )}
          </button>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5 px-2">
        <SidebarLink href="/admin" icon={<LayoutDashboardIcon className="size-4 shrink-0" />} label="Dashboard" collapsed={collapsed} active={pathname === "/admin"} />
        <SidebarLink href="/admin/users" icon={<UsersIcon className="size-4 shrink-0" />} label="Users" collapsed={collapsed} active={pathname.startsWith("/admin/users")} />

        {/* Configuration section */}
        <div className="mt-2">
          {!collapsed && (
            <button
              onClick={() => setSettingsOpen((v) => !v)}
              className="w-full px-3 py-1.5 flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground"
            >
              Configuration
              {settingsOpen ? (
                <ChevronLeft className="size-3" />
              ) : (
                <ChevronRight className="size-3" />
              )}
            </button>
          )}
          {(!collapsed && settingsOpen) && (
            <div className="space-y-0.5">
              {CONFIG_TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <SidebarLink
                    key={tab.id}
                    href={tab.href}
                    icon={<Icon className="size-4 shrink-0" />}
                    label={tab.label}
                    collapsed={collapsed}
                    active={pathname.includes(`/${tab.id}`)}
                  />
                );
              })}
            </div>
          )}
          {collapsed && (
            <div className="space-y-0.5">
              {CONFIG_TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <SidebarLink
                    key={tab.id}
                    href={tab.href}
                    icon={<Icon className="size-4 shrink-0" />}
                    label={tab.label}
                    collapsed={collapsed}
                    active={pathname.includes(`/${tab.id}`)}
                  />
                );
              })}
            </div>
          )}
        </div>

        <SidebarLink href="/admin/health" icon={<ShieldIcon className="size-4 shrink-0" />} label="Health" collapsed={collapsed} active={pathname === "/admin/health"} />
        <SidebarLink href="/admin/audit" icon={<HistoryIcon className="size-4 shrink-0" />} label="Audit Log" collapsed={collapsed} active={pathname === "/admin/audit"} />
      </nav>
    </div>
  );

  return (
    <div className="relative bg-background w-full flex min-h-screen">
      {/* Mobile hamburger button — visible only on < 768px */}
      <button
        onClick={() => setMobileOpen((v) => !v)}
        className="fixed top-4 left-4 z-50 p-2 rounded-md border border-border bg-background shadow-sm md:hidden"
        aria-label="Toggle menu"
      >
        {mobileOpen ? (
          <X className="size-5" />
        ) : (
          <Menu className="size-5" />
        )}
      </button>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div
          ref={overlayRef}
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — fixed on mobile (slides in), static on desktop */}
      <div
        className={`
          fixed md:static inset-y-0 left-0 z-50 shrink-0
          transform transition-transform duration-200 ease-in-out md:transform-none
          ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        {sidebar}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {/* Breadcrumb */}
        <div className="border-b border-border px-6 py-3 pl-16 md:pl-6 flex items-center gap-1.5 text-sm shrink-0">
          <Link href="/admin" className="text-muted-foreground hover:text-foreground transition-colors">Admin</Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-foreground">{crumb2}</span>
          {activeConfigTab && (
            <>
              <span className="text-muted-foreground">/</span>
              <span className="text-foreground">{activeConfigTab.label}</span>
            </>
          )}
        </div>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {children}
        </div>
      </div>
    </div>
  );
}

function SidebarLink({
  href,
  icon,
  label,
  collapsed,
  active,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  collapsed: boolean;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
        active
          ? "bg-primary/10 text-primary font-medium"
          : "text-muted-foreground hover:text-foreground hover:bg-muted"
      } ${collapsed ? "justify-center" : ""}`}
    >
      {icon}
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}