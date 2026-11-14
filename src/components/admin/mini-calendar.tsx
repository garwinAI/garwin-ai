// A small month grid for the Calendar widget: today circled, days with upcoming items dotted.
export function MiniCalendar({ today, marked }: { today: Date; marked: Set<string> }) {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = [...Array.from({ length: first }, () => null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const key = (d: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return (
    <div>
      <p className="mb-2 text-sm font-semibold">{today.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</p>
      <div className="grid grid-cols-7 gap-0.5 text-center text-xs" role="presentation">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i} className="py-1 font-medium text-neutral-500" aria-hidden="true">{d}</span>
        ))}
        {cells.map((d, i) =>
          d === null ? (
            <span key={`e${i}`} />
          ) : (
            <span
              key={d}
              className={
                d === today.getUTCDate()
                  ? "relative mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 font-semibold text-white"
                  : "relative mx-auto flex h-7 w-7 items-center justify-center rounded-full text-neutral-700"
              }
            >
              {d}
              {marked.has(key(d)) && <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-accent-500" aria-hidden="true" />}
            </span>
          ),
        )}
      </div>
    </div>
  );
}
