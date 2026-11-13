"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ChevronDown } from "lucide-react";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { cn } from "@/components/ui/cn";
import { STATUS_LABELS, USER_STATUSES, type UserStatus } from "@/lib/user-status";
import { setUserStatusAction } from "./actions";

const STATUS_STYLE: Record<UserStatus, string> = {
  active: "bg-green-50 text-green-700 ring-green-200",
  needs_attention: "bg-yellow-50 text-yellow-800 ring-yellow-200",
  inactive: "bg-neutral-100 text-neutral-700 ring-neutral-200",
  marked_for_deletion: "bg-red-50 text-red-700 ring-red-200",
  deleted: "bg-red-100 text-red-800 ring-red-300",
};

/** View · [Status ▾] · Edit · Remote view · Delete, for one user row. */
export function UserActions({ userId, name, status, isSelf }: { userId: string; name: string; status: UserStatus; isSelf: boolean }) {
  const [state, action] = useActionState(setUserStatusAction, undefined);
  const small = "btn px-2.5 py-1 text-xs";
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <Link href={`/admin/users/${userId}`} className={cn(small, "btn-secondary")}>
        View<span className="sr-only"> {name}</span>
      </Link>

      {isSelf ? (
        <span className={cn("rounded-lg px-2.5 py-1 text-xs font-medium ring-1", STATUS_STYLE[status])}>{STATUS_LABELS[status]}</span>
      ) : (
        <details className="relative">
          <summary className={cn("flex cursor-pointer list-none items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium ring-1", STATUS_STYLE[status])}>
            {STATUS_LABELS[status]}
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
            <span className="sr-only">: change status of {name}</span>
          </summary>
          <form action={action} className="absolute right-0 z-10 mt-1 w-48 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg">
            <input type="hidden" name="userId" value={userId} />
            {USER_STATUSES.map((s) => (
              <button
                key={s}
                type="submit"
                name="status"
                value={s}
                aria-current={s === status ? "true" : undefined}
                className={cn("block w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-neutral-100", s === status && "font-semibold")}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </form>
        </details>
      )}

      <Link href={`/admin/users/${userId}#edit`} className={cn(small, "btn-secondary")}>
        Edit<span className="sr-only"> {name}</span>
      </Link>
      {!isSelf && (
        <Link href={`/admin/users/${userId}#remote-view`} className={cn(small, "btn-secondary")}>
          Remote view<span className="sr-only"> of {name}</span>
        </Link>
      )}
      {!isSelf && status !== "deleted" && (
        <details className="relative">
          <summary className={cn(small, "btn-danger cursor-pointer list-none")}>
            Delete<span className="sr-only"> {name}</span>
          </summary>
          <form action={action} className="absolute right-0 z-10 mt-1 w-56 space-y-2 rounded-lg border border-neutral-200 bg-white p-3 text-sm shadow-lg">
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="status" value="deleted" />
            <p>Delete {name}? They&apos;re signed out and can&apos;t sign in. Their data is kept, so an Admin can restore them.</p>
            <SubmitButton className="btn-danger w-full text-sm" pendingText="Deleting…">
              Yes, delete
            </SubmitButton>
          </form>
        </details>
      )}
      {state && <div className="basis-full"><FormMessage state={state} /></div>}
    </div>
  );
}
