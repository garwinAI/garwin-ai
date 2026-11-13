import Link from "next/link";
import { Search } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { LocalTime } from "@/components/ui/local-time";
import { USER_FILTERS, USER_FILTER_LABELS, USER_SORTS, USER_SORT_LABELS, withParams, type UserListQuery } from "@/lib/admin-dashboard";
import { PLAN_SPEC, isPlanId } from "@/lib/plans";
import type { AdminUserRow } from "@/server/services/admin-users";
import { UserActions } from "@/app/(app)/admin/users/user-actions";

/** Searchable, filterable, sortable list of users with per-user actions. Links keep other params. */
export function UsersTable({
  rows,
  total,
  pageSize,
  query,
  params,
  adminId,
}: {
  rows: AdminUserRow[];
  total: number;
  pageSize: number;
  query: UserListQuery;
  params: Record<string, string>;
  adminId: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const link = (changes: Record<string, string | number | null>) => `/admin${withParams(params, { page: null, ...changes })}#users`;
  return (
    <div className="space-y-4">
      <form action="/admin#users" className="flex flex-wrap items-end gap-2" role="search">
        {Object.entries(params)
          .filter(([k]) => !["q", "page"].includes(k))
          .map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        <div className="min-w-0 flex-1">
          <label htmlFor="user-search" className="label">Search users</label>
          <input id="user-search" name="q" type="search" defaultValue={query.q} placeholder="Name or email" className="input" />
        </div>
        <button type="submit" className="btn-primary">
          <Search className="h-4 w-4" aria-hidden="true" /> Search
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter users" className="flex flex-wrap gap-1">
          {USER_FILTERS.map((f) => (
            <Link
              key={f}
              href={link({ filter: f === "all" ? null : f })}
              aria-current={query.filter === f ? "true" : undefined}
              className={cn("rounded-full px-3 py-1 text-xs font-medium", query.filter === f ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200")}
            >
              {USER_FILTER_LABELS[f]}
            </Link>
          ))}
        </nav>
        <nav aria-label="Sort users" className="flex items-center gap-1 text-xs">
          <span className="text-neutral-500">Sort:</span>
          {USER_SORTS.map((s) => (
            <Link
              key={s}
              href={link({ sort: s === "newest" ? null : s })}
              aria-current={query.sort === s ? "true" : undefined}
              className={cn("rounded-md px-2 py-1", query.sort === s ? "bg-brand-50 font-semibold text-brand-700" : "text-neutral-600 hover:bg-neutral-100")}
            >
              {USER_SORT_LABELS[s]}
            </Link>
          ))}
        </nav>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-500">No users match.</p>
      ) : (
        <ul className="divide-y divide-neutral-100" aria-label="Users">
          {rows.map((u) => (
            <li key={u.id} data-testid="user-row" className="flex flex-col gap-2 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {u.name}
                  {u.role === "admin" && <span className="ml-2 rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">Admin</span>}
                </p>
                <p className="truncate text-sm text-neutral-500">
                  {u.email} · {isPlanId(u.plan) ? PLAN_SPEC[u.plan].name : u.plan}
                  {u.teamSize > 0 && ` · host of ${u.teamSize}`}
                  {u.isTeamMember && " · team member"} · joined <LocalTime iso={u.createdAt.toISOString()} dateOnly />
                </p>
              </div>
              <UserActions userId={u.id} name={u.name} status={u.status} isSelf={u.id === adminId} />
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between text-sm text-neutral-600">
        <span>
          {total} user{total === 1 ? "" : "s"}
          {pages > 1 && ` · page ${query.page} of ${pages}`}
        </span>
        {pages > 1 && (
          <span className="flex gap-2">
            {query.page > 1 && <Link className="btn-secondary px-3 py-1 text-sm" href={link({ page: query.page - 1 })}>Previous</Link>}
            {query.page < pages && <Link className="btn-secondary px-3 py-1 text-sm" href={link({ page: query.page + 1 })}>Next</Link>}
          </span>
        )}
      </div>
    </div>
  );
}
