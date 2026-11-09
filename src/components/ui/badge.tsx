import type { ReactNode } from "react";
import { cn } from "./cn";

export type BadgeTone = "neutral" | "brand" | "accent" | "success" | "warning" | "danger";

const TONE: Record<BadgeTone, string> = {
  neutral: "bg-neutral-100 text-neutral-700",
  brand: "bg-brand-50 text-brand-700",
  accent: "bg-accent-50 text-accent-700",
  success: "bg-green-50 text-green-700",
  warning: "bg-yellow-50 text-yellow-800",
  danger: "bg-red-50 text-red-700",
};

export function Badge({ tone = "neutral", children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", TONE[tone], className)}>
      {children}
    </span>
  );
}

/** Marks a feature that exists in the UI but is scheduled for a later build phase. */
export function PlannedBadge({ phase }: { phase: number }) {
  return <Badge tone="accent">Coming in Phase {phase}</Badge>;
}
