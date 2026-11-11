export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 bg-white px-8 py-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-neutral-500">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-100">
        <Icon className="h-5 w-5 text-neutral-500" />
      </span>
      <p className="font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-neutral-500">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ComingSoon({ phase }: { phase: number }) {
  return (
    <span className="rounded-full bg-accent-50 px-2 py-0.5 text-xs font-medium text-accent-700">
      Coming in Phase {phase}
    </span>
  );
}
