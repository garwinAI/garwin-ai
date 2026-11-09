import type { ReactNode } from "react";

/** Top of every workspace page. Renders the page's single <h1>. */
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 bg-white px-4 py-5 sm:px-8">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-neutral-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

/** Extra bottom space so the floating Assistant button never covers the end of a page. */
export const FAB_CLEARANCE = "pb-24";

/** Standard padded body below a PageHeader. */
export function PageBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`space-y-6 p-4 sm:p-8 ${FAB_CLEARANCE} ${className}`}>{children}</div>;
}
