import Link from "next/link";
import { Logo } from "@/components/logo";
import { SITE_SECTIONS } from "./site-header";

const LEGAL = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

const linkClass = "rounded text-sm text-neutral-600 hover:text-neutral-900 hover:underline";

export function SiteFooter() {
  return (
    <footer className="border-t border-neutral-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <Logo />
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
            {[...SITE_SECTIONS, ...LEGAL].map((l) => (
              <Link key={l.href} href={l.href} className={linkClass}>
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <p className="mt-8 border-t border-neutral-200 pt-6 text-sm text-neutral-500">
          &copy; 2026 GarwinAI, All Rights Reserved.
        </p>
      </div>
    </footer>
  );
}
