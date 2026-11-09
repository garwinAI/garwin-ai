"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./cn";

export type NavTab = { href: string; label: string };

/**
 * Section navigation: horizontal and scrollable on small screens, vertical on large ones.
 * The current tab is marked with aria-current="page".
 */
export function NavTabs({ tabs, label }: { tabs: NavTab[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="-mx-4 shrink-0 overflow-x-auto px-4 sm:mx-0 sm:px-0 lg:w-48">
      <ul className="flex gap-1 lg:flex-col">
        {tabs.map((t) => {
          const active = pathname === t.href || pathname.startsWith(t.href + "/");
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block whitespace-nowrap rounded-lg px-3 py-2 text-sm",
                  active
                    ? "bg-white font-medium text-neutral-900 shadow-sm ring-1 ring-neutral-200"
                    : "text-neutral-600 hover:bg-white/60 hover:text-neutral-900",
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
