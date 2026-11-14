// The "Server" widget, drawn as a little rack: one unit per resource, each with status LEDs, a
// readout and (for storage) a capacity bar. Numbers are real; LED color reflects the reading.
import { formatBytes } from "@/lib/growth";
import { cn } from "@/components/ui/cn";

type Stats = {
  databaseBytes: number;
  storage: { used: number; allocated: number; workspaces: number };
  files: { files: number; folders: number; marked: number };
  appzone: { apps: { total: number; published: number }; widgets: { total: number; published: number }; themes: { total: number; published: number }; bundles: number };
};

function Unit({ name, children, led = "green", busy = false }: { name: string; children: React.ReactNode; led?: "green" | "amber" | "red" | "off"; busy?: boolean }) {
  const ledColor = { green: "bg-green-400 shadow-[0_0_6px_#4ade80]", amber: "bg-amber-400 shadow-[0_0_6px_#fbbf24]", red: "bg-red-500 shadow-[0_0_6px_#ef4444]", off: "bg-neutral-600" }[led];
  return (
    <li className="flex items-center gap-3 rounded-md border border-neutral-700 bg-gradient-to-b from-neutral-800 to-neutral-900 px-3 py-2">
      <span className="flex flex-col gap-1" aria-hidden="true">
        <span className={cn("h-1.5 w-1.5 rounded-full", ledColor)} />
        <span className={cn("h-1.5 w-1.5 rounded-full bg-sky-400", busy ? "motion-safe:animate-pulse" : "opacity-30")} />
      </span>
      <span className="w-20 shrink-0 font-mono text-[10px] uppercase tracking-wider text-neutral-400">{name}</span>
      <span className="min-w-0 flex-1 font-mono text-sm text-neutral-100">{children}</span>
      <span className="hidden gap-0.5 sm:flex" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => <span key={i} className="h-3 w-0.5 rounded bg-neutral-700" />)}
      </span>
    </li>
  );
}

export function ServerRack({ stats, online }: { stats: Stats; online: boolean }) {
  const pct = stats.storage.allocated ? Math.min(100, (stats.storage.used / stats.storage.allocated) * 100) : 0;
  const z = stats.appzone;
  return (
    <div className="rounded-xl bg-neutral-950 p-3 ring-1 ring-neutral-800">
      <ul className="space-y-1.5">
        <Unit name="Database" led={online ? "green" : "red"} busy={online}>
          {online ? "Online" : "Offline"} · {formatBytes(stats.databaseBytes)}
        </Unit>
        <Unit name="User storage" led={pct > 90 ? "red" : pct > 70 ? "amber" : "green"}>
          <span className="block">{formatBytes(stats.storage.used)} <span className="text-neutral-400">of {formatBytes(stats.storage.allocated)} allocated</span></span>
          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-neutral-700" role="meter" aria-label="User storage used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
            <span className="block h-full rounded-full bg-gradient-to-r from-sky-400 to-brand-500" style={{ width: `${Math.max(pct, stats.storage.used ? 1 : 0)}%` }} />
          </span>
        </Unit>
        <Unit name="Files" led={stats.files.marked ? "amber" : "green"}>
          {stats.files.files} files · {stats.files.folders} folders{stats.files.marked ? ` · ${stats.files.marked} marked for deletion` : ""}
        </Unit>
        <Unit name="App storage" led={z.bundles ? "green" : "off"}>
          {z.bundles} app bundle{z.bundles === 1 ? "" : "s"} <span className="text-neutral-400">(sizes tracked once uploads open, Phase 5)</span>
        </Unit>
        <Unit name="AppZone" led={z.apps.published + z.widgets.published + z.themes.published ? "green" : "off"}>
          {z.apps.total} apps · {z.widgets.total} widgets · {z.themes.total} themes
          <span className="block text-xs text-neutral-400">
            {z.apps.published + z.widgets.published + z.themes.published} published
          </span>
        </Unit>
      </ul>
      <p className="mt-2 text-right font-mono text-[10px] text-neutral-400">{stats.storage.workspaces} workspaces</p>
    </div>
  );
}
