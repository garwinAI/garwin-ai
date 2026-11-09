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
};

// Order follows the product spec. Log Out is rendered separately at the bottom.
export const MAIN_NAV: NavItem[] = [
  { href: "/assistant", label: "Assistant", icon: Sparkles, appSlug: "assistant" },
  { href: "/messages", label: "Messages", icon: MessageSquare, appSlug: "messages" },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, appSlug: "calendar" },
  { href: "/apps", label: "Apps", icon: LayoutGrid },
  { href: "/appzone", label: "Go to AppZone", icon: Store, accent: true },
  { href: "/contacts", label: "Contacts", icon: Users, appSlug: "contacts" },
  { href: "/storage", label: "Storage", icon: HardDrive, appSlug: "storage" },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const ADMIN_NAV: NavItem = { href: "/admin", label: "Admin", icon: ShieldCheck };

export const SIDEBAR_COOKIE = "garwin_sidebar";

/** Items to show, given the account's active app slugs. */
export function visibleNav(activeApps: string[], isAdmin: boolean): NavItem[] {
  const items = MAIN_NAV.filter((i) => !i.appSlug || activeApps.includes(i.appSlug));
  return isAdmin ? [...items, ADMIN_NAV] : items;
}

export const isActivePath = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/");
