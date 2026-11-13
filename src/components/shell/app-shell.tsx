"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Logo } from "@/components/logo";
import { Drawer } from "@/components/ui/drawer";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/components/ui/cn";
import { SIDEBAR_COOKIE, visibleNav } from "./nav";
import { SidebarNav, type ShellUser } from "./sidebar";
import { WorkspaceSwitcher, type Workspace } from "./workspace-switcher";

/**
 * Responsive workspace frame.
 *  - lg and up: narrow left sidebar, collapsible to icons (state remembered in a cookie).
 *  - below lg:  top bar with a menu button that opens the same navigation in a drawer.
 */
export function AppShell({
  activeApps,
  isAdmin,
  permissions,
  workspaces,
  currentAccountId,
  user,
  unreadNotifications,
  initialCollapsed,
  children,
}: {
  /** Slugs of active apps; their nav items are shown */
  activeApps: string[];
  isAdmin: boolean;
  permissions: string[];
  workspaces: Workspace[];
  currentAccountId: string;
  user: ShellUser;
  unreadNotifications: number;
  initialCollapsed: boolean;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const items = visibleNav(activeApps, isAdmin, permissions);
  const switcher = workspaces.length > 1 ? <WorkspaceSwitcher workspaces={workspaces} currentAccountId={currentAccountId} /> : null;

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg"
      >
        Skip to content
      </a>

      {/* Mobile / tablet top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-neutral-200 bg-white px-2 lg:hidden">
        <IconButton icon={Menu} label="Open menu" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)} />
        <Link href="/assistant" aria-label="Garwin AI home">
          <Logo />
        </Link>
      </header>
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} label="Menu">
        <div className="flex h-14 items-center px-4">
          <Logo />
        </div>
        {switcher}
        <SidebarNav items={items} user={user} unread={unreadNotifications} onNavigate={() => setDrawerOpen(false)} />
      </Drawer>

      {/* Desktop sidebar */}
      <aside
        aria-label="Sidebar"
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-neutral-200 bg-white transition-[width] duration-200 lg:flex",
          collapsed ? "w-16" : "w-56",
        )}
      >
        <div className={cn("flex h-14 items-center", collapsed ? "justify-center" : "justify-between px-4")}>
          <Link href="/assistant" aria-label="Garwin AI home">
            <Logo collapsed={collapsed} />
          </Link>
          {!collapsed && <IconButton icon={PanelLeftClose} label="Collapse sidebar" onClick={toggleCollapsed} />}
        </div>
        {collapsed && (
          <div className="mb-1 flex justify-center">
            <IconButton icon={PanelLeftOpen} label="Expand sidebar" onClick={toggleCollapsed} />
          </div>
        )}
        {!collapsed && switcher}
        <SidebarNav items={items} user={user} unread={unreadNotifications} collapsed={collapsed} />
      </aside>

      <main id="main" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
        {children}
      </main>
    </div>
  );
}
