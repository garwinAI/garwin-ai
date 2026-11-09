"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Order follows the product spec.
const TABS = [
  { href: "/settings/general", label: "General" },
  { href: "/settings/payments", label: "Payments" },
  { href: "/settings/cards", label: "Cards" },
  { href: "/settings/apps", label: "Apps" },
  { href: "/settings/security", label: "Security" },
  { href: "/settings/passwords", label: "Passwords" },
  { href: "/settings/ip-history", label: "IP History" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings" className="flex shrink-0 gap-1 overflow-x-auto lg:w-48 lg:flex-col">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm ${
              active ? "bg-white font-medium text-neutral-900 shadow-sm ring-1 ring-neutral-200" : "text-neutral-600 hover:bg-white/60 hover:text-neutral-900"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
