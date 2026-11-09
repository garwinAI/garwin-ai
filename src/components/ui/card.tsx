import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("card", className)} {...props} />;
}

/** A titled card section. Renders a <section> labelled by its heading. */
export function CardSection({
  id,
  title,
  description,
  actions,
  children,
  className,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const headingId = `${id}-title`;
  return (
    <section aria-labelledby={headingId} className={cn("card", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-200 px-4 py-4 sm:px-6">
        <div>
          <h2 id={headingId} className="font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-neutral-500">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="px-4 py-5 sm:px-6">{children}</div>
    </section>
  );
}
