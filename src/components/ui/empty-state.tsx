import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-100">
        <Icon className="h-5 w-5 text-neutral-500" aria-hidden="true" />
      </span>
      <p className="font-medium">{title}</p>
      <div className="mt-1 max-w-sm text-sm text-neutral-500">{body}</div>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
