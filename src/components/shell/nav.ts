import {
  CalendarDays,
  HardDrive,
  LayoutGrid,
  MessageSquare,
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  accent?: boolean;
  /** When set, the item is hidden if this app is deactivated for the account */
  appSlug?: string;
  /** When set, the item is hidden from team members without this permission */
  permission?: string;
};

// Order follows the product spec. Log Out is rendered separately at the bottom.
export const MAIN_NAV: NavItem[] = [
  { href: "/assistant", label: "Assistant", icon: Sparkles, appSlug: "assistant" },
  { href: "/messages", label: "Messages", icon: MessageSquare, appSlug: "messages", permission: "messages.use" },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, appSlug: "calendar", permission: "calendar.view" },
  { href: "/apps", label: "Apps", icon: LayoutGrid },
  { href: "/appzone", label: "Go to AppZone", icon: Store, accent: true },
  { href: "/contacts", label: "Contacts", icon: Users, appSlug: "contacts", permission: "contacts.view" },
  { href: "/storage", label: "Storage", icon: HardDrive, appSlug: "storage", permission: "storage.view" },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const ADMIN_NAV: NavItem = { href: "/admin", label: "Admin", icon: ShieldCheck };

export const SIDEBAR_COOKIE = "garwin_sidebar";

/**
 * Items to show, given the account's active apps and the user's permissions. This only tidies the
 * menu; every page and action still checks permissions on the server.
 */
export function visibleNav(activeApps: string[], isAdmin: boolean, permissions?: readonly string[]): NavItem[] {
  const items = MAIN_NAV.filter(
    (i) => (!i.appSlug || activeApps.includes(i.appSlug)) && (!i.permission || !permissions || permissions.includes(i.permission)),
  );
  return isAdmin ? [...items, ADMIN_NAV] : items;
}

export const isActivePath = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/");
