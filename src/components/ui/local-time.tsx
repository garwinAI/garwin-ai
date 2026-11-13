"use client";

/** Formats a timestamp in the viewer's own time zone. `dateOnly` leaves out the time of day. */
export function LocalTime({ iso, dateOnly = false }: { iso: string; dateOnly?: boolean }) {
  const date = new Date(iso);
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {dateOnly ? date.toLocaleDateString(undefined, { dateStyle: "medium" }) : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
    </time>
  );
}
