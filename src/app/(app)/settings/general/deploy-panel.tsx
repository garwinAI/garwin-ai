"use client";

import { useActionState, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { LocalTime } from "@/components/ui/local-time";
import { removeScheduleAction, scheduleUpdateAction, updateAppAction } from "../../admin/actions";

type Scheduled = { ref: string; at: string; sha: string };

/**
 * Deploy Now / Schedule. The server re-checks everything (Admin, dev version, time); disabled
 * buttons are only a courtesy.
 */
export function DeployPanel({
  devSha,
  blockedReason,
  scheduled,
  failed,
}: {
  devSha: string | null;
  blockedReason: string | null;
  scheduled: Scheduled | null;
  failed: Scheduled[];
}) {
  const [nowState, deployNow] = useActionState(updateAppAction, undefined);
  const [scheduleState, schedule] = useActionState(scheduleUpdateAction, undefined);
  const [removeState, remove] = useActionState(removeScheduleAction, undefined);
  const [when, setWhen] = useState("");
  const disabled = !devSha || Boolean(blockedReason);
  const iso = when ? new Date(when).toISOString() : "";

  return (
    <div className="space-y-5">
      {blockedReason && <p className="text-sm text-neutral-600">{blockedReason}</p>}

      <form action={deployNow} className="space-y-2">
        {devSha && <input type="hidden" name="sha" value={devSha} />}
        <SubmitButton pendingText="Deploying…" disabled={disabled}>
          Deploy Now
        </SubmitButton>
        <FormMessage state={nowState} />
      </form>

      <form action={schedule} className="space-y-2 border-t border-neutral-200 pt-5">
        {devSha && <input type="hidden" name="sha" value={devSha} />}
        <input type="hidden" name="at" value={iso} />
        <label htmlFor="deploy-at" className="label">
          Schedule for later
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <input
            id="deploy-at"
            type="datetime-local"
            className="input w-auto"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            aria-describedby="deploy-at-hint"
            required
          />
          <SubmitButton className="btn-secondary" pendingText="Scheduling…" disabled={disabled || !when}>
            Schedule
          </SubmitButton>
        </div>
        <p id="deploy-at-hint" className="text-xs text-neutral-500">
          Your local time. The version shown above goes live within about 15 minutes of the time you pick; later changes to dev
          are not included. Scheduling again replaces the earlier schedule.
        </p>
        <FormMessage state={scheduleState} />
      </form>

      <FormMessage state={removeState} />
      {(scheduled || failed.length > 0) && (
        <div className="space-y-2 border-t border-neutral-200 pt-5">
          {scheduled && (
            <form action={remove} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">
              <input type="hidden" name="ref" value={scheduled.ref} />
              <span>
                Scheduled: version {scheduled.sha.slice(0, 7)} goes live at <LocalTime iso={scheduled.at} />.
              </span>
              <SubmitButton className="btn text-sm text-brand-700 hover:bg-brand-100" pendingText="Canceling…">
                Cancel schedule
              </SubmitButton>
            </form>
          )}
          {failed.map((f) => (
            <form key={f.ref} action={remove} role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <input type="hidden" name="ref" value={f.ref} />
              <span>
                The deploy scheduled for <LocalTime iso={f.at} /> couldn&apos;t go live: the live branch has changes that dev doesn&apos;t.
                Merge live into dev, then deploy again.
              </span>
              <SubmitButton className="btn text-sm text-red-700 hover:bg-red-100" pendingText="…">
                Dismiss
              </SubmitButton>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
