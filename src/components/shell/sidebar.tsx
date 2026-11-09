"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Logo } from "@/components/logo";
import { logOut } from "@/lib/auth/actions";
import { ADMIN_NAV, MAIN_NAV, SIDEBAR_COOKIE, type NavItem } from "./nav";



type Props = {
  initialCollapsed: boolean;
  user: { name: string; email: string; plan: string; isAdmin: boolean };
};

export function Sidebar({ initialCollapsed, user }: Props) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const pathname = usePathname();

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  }

  const items = user.isAdmin ? [...MAIN_NAV, ADMIN_NAV] : MAIN_NAV;

  return (
    <aside
      className={`sticky top-0 flex h-screen shrink-0 flex-col border-r border-neutral-200 bg-white transition-[width] duration-200 ${
        collapsed ? "w-16" : "w-56"
      }`}
    >
      <div className={`flex h-14 items-center ${collapsed ? "justify-center" : "justify-between px-4"}`}>
        <Link href="/assistant" aria-label="Garwin AI home">
          <Logo collapsed={collapsed} />
        </Link>
        {!collapsed && (
          <button onClick={toggle} className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" aria-label="Collapse sidebar">
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {collapsed && (
        <button onClick={toggle} className="mx-auto mb-2 rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" aria-label="Expand sidebar">
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      )}

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2" aria-label="Main">
        {items.map((item) => (
          <NavLink key={item.href} item={item} collapsed={collapsed} active={pathname === item.href || pathname.startsWith(item.href + "/")} />
        ))}
      </nav>

      <div className="border-t border-neutral-200 p-2">
        {!collapsed && (
          <div className="mb-1 px-2 py-1.5">
            <p className="truncate text-sm font-medium text-neutral-900">{user.name}</p>
            <p className="truncate text-xs text-neutral-500">
              {user.email} · <span className="font-medium capitalize text-accent-600">{user.plan}</span>
            </p>
          </div>
        )}
        <form action={logOut}>
          <button
            type="submit"
            title={collapsed ? "Log Out" : undefined}
            className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 ${collapsed ? "justify-center" : ""}`}
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && "Log Out"}
          </button>
        </form>
      </div>
    </aside>
  );
}

function NavLink({ item, collapsed, active }: { item: NavItem; collapsed: boolean; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={`relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors ${collapsed ? "justify-center" : ""} ${
        active ? "bg-neutral-100 font-medium text-neutral-900" : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
      }`}
    >
      {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent-500" />}
      <Icon className={`h-[18px] w-[18px] shrink-0 ${item.accent ? "text-accent-500" : ""}`} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}
