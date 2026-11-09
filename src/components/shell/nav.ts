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

export type NavItem = { href: string; label: string; icon: LucideIcon; accent?: boolean };

// Order follows the product spec.
export const MAIN_NAV: NavItem[] = [
  { href: "/assistant", label: "Assistant", icon: Sparkles },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/apps", label: "Apps", icon: LayoutGrid },
  { href: "/appzone", label: "Go to AppZone", icon: Store, accent: true },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/storage", label: "Storage", icon: HardDrive },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const ADMIN_NAV: NavItem = { href: "/admin", label: "Admin", icon: ShieldCheck };

export const SIDEBAR_COOKIE = "garwin_sidebar";
