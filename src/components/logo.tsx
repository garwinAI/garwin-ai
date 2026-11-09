export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-neutral-900" />
      <path
        d="M21.5 11.2A7 7 0 1 0 23 16h-6.5"
        fill="none"
        stroke="white"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24.5" cy="8" r="2.5" className="fill-accent-500" />
    </svg>
  );
}

export function Logo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      {!collapsed && (
        <span data-logo className="text-[15px] font-semibold tracking-tight text-neutral-900">
          Garwin <span className="text-accent-500">AI</span>
        </span>
      )}
    </span>
  );
}
