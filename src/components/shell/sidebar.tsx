"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { logOut } from "@/lib/auth/actions";
import { cn } from "@/components/ui/cn";
import { isActivePath, type NavItem } from "./nav";

export type ShellUser = { name: string; email: string; planName: string };

/** Navigation list + account footer. Shared by the desktop sidebar and the mobile drawer. */
export function SidebarNav({
  items,
  user,
  collapsed = false,
  onNavigate,
}: {
  items: NavItem[];
  user: ShellUser;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <>
      <nav className="flex-1 overflow-y-auto px-2 py-2" aria-label="Main">
        <ul className="space-y-0.5">
          {items.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  title={collapsed ? item.label : undefined}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-brand-600",
                    collapsed && "justify-center",
                    active ? "bg-neutral-100 font-medium text-neutral-900" : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900",
                  )}
                >
                  {active && <span className="absolute bottom-1.5 left-0 top-1.5 w-0.5 rounded-full bg-accent-500" aria-hidden="true" />}
                  <Icon className={cn("h-[18px] w-[18px] shrink-0", item.accent && "text-accent-500")} aria-hidden="true" />
                  {/* Label stays in the DOM when collapsed so screen readers still announce it. */}
                  <span className={collapsed ? "sr-only" : "truncate"}>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-neutral-200 p-2">
        {!collapsed && (
          <div className="mb-1 px-2 py-1.5">
            <p className="truncate text-sm font-medium text-neutral-900">{user.name}</p>
            <p className="truncate text-xs text-neutral-500">{user.email}</p>
            <p className="text-xs font-medium text-accent-700">{user.planName} plan</p>
          </div>
        )}
        <form action={logOut}>
          <button
            type="submit"
            title={collapsed ? "Log Out" : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-brand-600",
              collapsed && "justify-center",
            )}
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            <span className={collapsed ? "sr-only" : undefined}>Log Out</span>
          </button>
        </form>
      </div>
    </>
  );
}
