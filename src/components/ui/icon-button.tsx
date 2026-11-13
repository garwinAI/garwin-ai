import type { ComponentProps } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "./cn";

/**
 * Icon-only button. `label` is required: it becomes the accessible name and the tooltip,
 * because an icon alone means nothing to a screen reader.
 */
export function IconButton({
  icon: Icon,
  label,
  className,
  type = "button",
  ...props
}: { icon: LucideIcon; label: string } & Omit<ComponentProps<"button">, "children" | "aria-label">) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
    </button>
  );
}
