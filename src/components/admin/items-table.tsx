import Link from "next/link";
import { cn } from "@/components/ui/cn";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/pricing";
import { ITEM_KINDS, ITEM_SORTS, ITEM_SORT_LABELS, ITEM_TABS, withParams, type ItemListQuery } from "@/lib/admin-dashboard";
import type { AdminItemRow } from "@/server/services/admin-users";

const KIND_LABELS = { all: "All", app: "Apps", widget: "Widgets", theme: "Themes" } as const;

/** AppZone apps, widgets and themes with Free / Paid tabs, a kind filter and sorting. */
export function ItemsTable({
  rows,
  total,
  pageSize,
  query,
  params,
}: {
  rows: AdminItemRow[];
  total: number;
  pageSize: number;
  query: ItemListQuery;
  params: Record<string, string>;
}) {
  const link = (changes: Record<string, string | number | null>) => `/admin${withParams(params, { ipage: null, ...changes })}#appzone`;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Price" className="inline-flex rounded-lg bg-neutral-100 p-1 text-sm">
        {ITEM_TABS.map((t) => (
          <Link
            key={t}
            role="tab"
            aria-selected={query.itab === t}
            href={link({ itab: t === "free" ? null : t })}
            className={cn("rounded-md px-4 py-1.5", query.itab === t ? "bg-white font-medium shadow-sm" : "text-neutral-600")}
          >
            {t === "free" ? "Free" : "Paid"}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Item type" className="flex flex-wrap gap-1">
          {ITEM_KINDS.map((k) => (
            <Link
              key={k}
              href={link({ ikind: k === "all" ? null : k })}
              aria-current={query.ikind === k ? "true" : undefined}
              className={cn("rounded-full px-3 py-1 text-xs font-medium", query.ikind === k ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200")}
            >
              {KIND_LABELS[k]}
            </Link>
          ))}
        </nav>
        <nav aria-label="Sort items" className="flex flex-wrap items-center gap-1 text-xs">
          <span className="text-neutral-500">Sort:</span>
          {ITEM_SORTS.filter((s) => query.itab === "paid" || !s.startsWith("price")).map((s) => (
            <Link
              key={s}
              href={link({ isort: s === "most_bought" ? null : s })}
              aria-current={query.isort === s ? "true" : undefined}
              className={cn("rounded-md px-2 py-1", query.isort === s ? "bg-brand-50 font-semibold text-brand-700" : "text-neutral-600 hover:bg-neutral-100")}
            >
              {ITEM_SORT_LABELS[s]}
            </Link>
          ))}
        </nav>
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-500">
          No {query.itab} {query.ikind === "all" ? "items" : KIND_LABELS[query.ikind].toLowerCase()} yet. Developers can publish once the AppZone
          marketplace opens (Phase 5).
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="text-neutral-500">
              <tr>
                <th scope="col" className="pb-2 font-medium">Name</th>
                <th scope="col" className="pb-2 font-medium">Type</th>
                <th scope="col" className="pb-2 font-medium">Price</th>
                <th scope="col" className="pb-2 font-medium">Bought / added</th>
                <th scope="col" className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((i) => (
                <tr key={i.id}>
                  <td className="py-2">
                    <p className="font-medium">{i.name}</p>
                    <p className="text-xs text-neutral-500">by {i.developer}</p>
                  </td>
                  <td className="py-2 capitalize">{i.kind}</td>
                  <td className="py-2">{i.priceCents === 0 ? "Free" : formatPrice(i.priceCents, i.currency)}</td>
                  <td className="py-2">{i.acquisitions}</td>
                  <td className="py-2"><Badge tone={i.status === "published" ? "success" : "neutral"}>{i.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center justify-between text-sm text-neutral-600">
        <span>
          {total} item{total === 1 ? "" : "s"}
          {pages > 1 && ` · page ${query.ipage} of ${pages}`}
        </span>
        {pages > 1 && (
          <span className="flex gap-2">
            {query.ipage > 1 && <Link className="btn-secondary px-3 py-1 text-sm" href={link({ ipage: query.ipage - 1 })}>Previous</Link>}
            {query.ipage < pages && <Link className="btn-secondary px-3 py-1 text-sm" href={link({ ipage: query.ipage + 1 })}>Next</Link>}
          </span>
        )}
      </div>
    </div>
  );
}
