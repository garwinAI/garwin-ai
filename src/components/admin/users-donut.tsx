// Paid vs free users as a donut, with the total in the middle. Identity is never color alone: a
// legend with counts and percentages sits beside it, each segment has a tooltip, and a visually
// hidden table carries the same numbers for screen readers. Colors validated with the dataviz
// palette checker (CVD-safe; the orange is lighter than 3:1, so labels are always visible).
const R = 40;
const C = 2 * Math.PI * R;
const GAP = 1.2; // ≈2px surface gap between segments at the rendered size

const SEGMENTS = [
  { key: "paid", label: "Paid", color: "#2563eb" },
  { key: "free", label: "Free", color: "#f97316" },
] as const;

export function UsersDonut({ total, paid, free }: { total: number; paid: number; free: number }) {
  const values = { paid, free };
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const shown = SEGMENTS.filter((s) => values[s.key] > 0);
  const gap = shown.length > 1 ? GAP : 0;
  const arcs = shown.map((s, i) => {
    const before = shown.slice(0, i).reduce((sum, p) => sum + values[p.key], 0);
    return {
      ...s,
      value: values[s.key],
      length: Math.max((values[s.key] / total) * C - gap, 0.5),
      offset: (before / total) * C,
    };
  });

  return (
    <figure className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 100 100" className="h-40 w-40 shrink-0 -rotate-90" role="img" aria-label={`${total} users: ${paid} paid, ${free} free`}>
        <circle cx="50" cy="50" r={R} fill="none" stroke="#e5e5e5" strokeWidth="14" />
        {arcs.map((a) => (
          <circle
            key={a.key}
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke={a.color}
            strokeWidth="14"
            strokeDasharray={`${a.length} ${C - a.length}`}
            strokeDashoffset={-a.offset}
            className="transition-[stroke-width] hover:[stroke-width:16]"
          >
            <title>{`${a.label}: ${a.value} (${pct(a.value)}%)`}</title>
          </circle>
        ))}
        <g className="rotate-90 [transform-origin:50px_50px]">
          <text x="50" y="49" textAnchor="middle" className="fill-neutral-900 text-[18px] font-semibold">
            {total}
          </text>
          <text x="50" y="62" textAnchor="middle" className="fill-neutral-500 text-[8px]">
            total users
          </text>
        </g>
      </svg>
      <figcaption className="space-y-2 text-sm">
        {SEGMENTS.map((s) => (
          <p key={s.key} className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
            <span className="text-neutral-700">{s.label}</span>
            <span className="font-semibold text-neutral-900">{values[s.key]}</span>
            <span className="text-neutral-500">({pct(values[s.key])}%)</span>
          </p>
        ))}
        <table className="sr-only">
          <caption>Users by plan type</caption>
          <tbody>
            <tr><th scope="row">Total</th><td>{total}</td></tr>
            <tr><th scope="row">Paid</th><td>{paid}</td></tr>
            <tr><th scope="row">Free</th><td>{free}</td></tr>
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}
