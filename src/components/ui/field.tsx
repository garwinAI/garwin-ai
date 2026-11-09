import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

type FieldProps = {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
};

/** Labelled text input with optional hint and error, wired up with aria-describedby / aria-invalid. */
export function TextField({ id, label, hint, error, className, ...input }: FieldProps & Omit<ComponentProps<"input">, "id">) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="label">{label}</label>
      <input
        id={id}
        aria-describedby={cn(hintId, errorId) || undefined}
        aria-invalid={error ? true : undefined}
        className={cn("input", error && "border-red-400", input.disabled && "bg-neutral-50 text-neutral-500")}
        {...input}
      />
      {hint && <p id={hintId} className="mt-1 text-xs text-neutral-500">{hint}</p>}
      {error && <p id={errorId} className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}

/** Labelled select. */
export function SelectField({
  id,
  label,
  hint,
  options,
  className,
  ...select
}: FieldProps & { options: { value: string; label: string }[] } & Omit<ComponentProps<"select">, "id" | "children">) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="label">{label}</label>
      <select id={id} aria-describedby={hintId} className="input" {...select}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {hint && <p id={hintId} className="mt-1 text-xs text-neutral-500">{hint}</p>}
    </div>
  );
}
