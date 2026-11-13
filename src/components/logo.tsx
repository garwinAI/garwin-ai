import { cn } from "@/components/ui/cn";

/**
 * Garwin AI wordmark: black "Garwin", blue "AI", no icon.
 * `collapsed` renders the short form ("G" + "AI") for the narrow sidebar.
 */
export function Logo({ collapsed = false, className }: { collapsed?: boolean; className?: string }) {
  return (
    <span
      data-logo
      className={cn("inline-flex items-center text-[17px] font-bold tracking-tight text-black", className)}
    >
      <span className="sr-only">Garwin AI</span>
      <span aria-hidden="true">
        {collapsed ? "G" : "Garwin"}
        <span className="text-brand-600">AI</span>
      </span>
    </span>
  );
}
