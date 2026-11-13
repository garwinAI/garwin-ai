import Link from "next/link";
import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui/button";

export const SITE_SECTIONS = [
  { href: "/#about", label: "About" },
  { href: "/#plans", label: "Plans" },
  { href: "/#faq", label: "FAQ" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" aria-label="Garwin AI home" className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600">
          <Logo />
        </Link>
        <nav aria-label="Site" className="hidden items-center gap-1 md:flex">
          {SITE_SECTIONS.map((s) => (
            <Link key={s.href} href={s.href} className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900">
              {s.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <ButtonLink href="/login" variant="ghost" className="px-3">Login</ButtonLink>
          <ButtonLink href="/signup" className="px-3 sm:px-4">Sign Up FREE</ButtonLink>
        </div>
      </div>
    </header>
  );
}
