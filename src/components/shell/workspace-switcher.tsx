"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { switchWorkspaceAction } from "@/lib/team/actions";

export type Workspace = { accountId: string; name: string; role: "owner" | "member" };

/** Lets people who belong to several workspaces (their own + teams they joined) switch between them. */
export function WorkspaceSwitcher({ workspaces, currentAccountId }: { workspaces: Workspace[]; currentAccountId: string }) {
  const current = workspaces.find((w) => w.accountId === currentAccountId) ?? workspaces[0];
  return (
    <details className="group relative mx-2 mb-1">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg border border-neutral-200 px-2.5 py-2 text-left text-sm hover:bg-neutral-50 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-[11px] font-medium uppercase tracking-wider text-neutral-500">Workspace</span>
          <span className="block truncate font-medium">{current.name}</span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
        <span className="sr-only">Switch workspace</span>
      </summary>
      <ul className="absolute left-0 right-0 z-20 mt-1 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg" aria-label="Workspaces">
        {workspaces.map((w) => (
          <li key={w.accountId}>
            <form action={switchWorkspaceAction.bind(null, w.accountId)}>
              <button
                type="submit"
                aria-current={w.accountId === current.accountId ? "true" : undefined}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-neutral-100"
              >
                <span className="min-w-0">
                  <span className="block truncate">{w.name}</span>
                  <span className="block text-xs text-neutral-500">{w.role === "owner" ? "Your workspace" : "Team member"}</span>
                </span>
                {w.accountId === current.accountId && <Check className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </details>
  );
}
