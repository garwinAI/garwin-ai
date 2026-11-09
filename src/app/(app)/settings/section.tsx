export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card">
      <div className="border-b border-neutral-200 px-6 py-4">
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-neutral-500">{description}</p>}
      </div>
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}
