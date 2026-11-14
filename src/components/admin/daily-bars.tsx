// New users and plan upgrades per day, as paired bars. Two series → legend + per-bar tooltips +
// a visually hidden table (colors validated with the dataviz checker; the orange is light, so the
// legend and table carry identity and values too).
const SERIES = [
  { key: "newUsers", label: "New users", color: "#2563eb" },
  { key: "upgrades", label: "Upgrades", color: "#f97316" },
] as const;

type Day = { day: string; newUsers: number; upgrades: number };

const W = 560;
const H = 160;
const PAD = { top: 10, right: 8, bottom: 22, left: 26 };

export function DailyBars({ data }: { data: Day[] }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.newUsers, d.upgrades]));
  const ticks = max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, Math.round(max / 2), max];
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / data.length;
  const bar = Math.max(2, Math.min(14, (slot - 6) / 2));
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const label = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const totals = { newUsers: data.reduce((n, d) => n + d.newUsers, 0), upgrades: data.reduce((n, d) => n + d.upgrades, 0) };

  return (
    <figure>
      <div className="mb-2 flex flex-wrap gap-4 text-xs" aria-hidden="true">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-neutral-700">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label} <span className="font-semibold text-neutral-900">{totals[s.key]}</span>
          </span>
        ))}
        <span className="text-neutral-500">last {data.length} days</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Last ${data.length} days: ${totals.newUsers} new users, ${totals.upgrades} upgrades`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#e5e5e5" strokeWidth="1" />
            <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" className="fill-neutral-500 text-[9px]">{t}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = PAD.left + slot * i + slot / 2;
          return (
            <g key={d.day}>
              {SERIES.map((s, j) => {
                const v = d[s.key];
                const h = Math.max(v > 0 ? 2 : 0, PAD.top + plotH - y(v));
                const x = cx - bar - 1 + j * (bar + 2);
                return (
                  <rect key={s.key} x={x} y={PAD.top + plotH - h} width={bar} height={h} rx={Math.min(3, bar / 2)} fill={s.color}>
                    <title>{`${label(d.day)} · ${s.label}: ${v}`}</title>
                  </rect>
                );
              })}
              {(i % Math.ceil(data.length / 7) === 0 || i === data.length - 1) && (
                <text x={cx} y={H - 6} textAnchor="middle" className="fill-neutral-500 text-[9px]">{label(d.day)}</text>
              )}
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>New users and upgrades per day</caption>
        <thead>
          <tr><th scope="col">Day</th><th scope="col">New users</th><th scope="col">Upgrades</th></tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.day}><th scope="row">{label(d.day)}</th><td>{d.newUsers}</td><td>{d.upgrades}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
