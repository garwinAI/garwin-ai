import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { getEntitlements } from "@/server/services/entitlements";
import { CardSection } from "@/components/ui/card";
import { DEV_BRANCH, LIVE_BRANCH, shortSha, updateBlockedReason } from "@/lib/app-update";
import { checkForUpdate, getDeploySchedule } from "@/server/services/app-update";
import { ProfileForm } from "./profile-form";
import { DeployPanel } from "./deploy-panel";

export const metadata: Metadata = { title: "General settings" };

export default async function GeneralSettings() {
  const user = await requireUser();
  const { plan, isTeamMember } = await getEntitlements(user);
  return (
    <>
      <CardSection id="profile" title="Profile" description="How you appear to your team.">
        <ProfileForm name={user.name} email={user.email} />
      </CardSection>
      <CardSection id="account" title="Account">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-[140px_1fr] sm:gap-y-3">
          <dt className="text-neutral-500">Plan</dt>
          <dd className="mb-2 font-medium sm:mb-0">{plan.name}{isTeamMember ? " (your host's plan)" : ""}</dd>
          <dt className="text-neutral-500">Account type</dt>
          <dd className="mb-2 sm:mb-0">{user.role === "admin" ? "Admin" : isTeamMember ? "Team member" : "Host"}</dd>
          <dt className="text-neutral-500">Member since</dt>
          <dd>{user.createdAt.toLocaleDateString("en-US", { dateStyle: "long" })}</dd>
        </dl>
      </CardSection>
      {user.role === "admin" && <DeploySection />}
    </>
  );
}

/** Admin only: copy dev.garwinai.com (dev branch) to garwinai.com (live branch), now or later. */
async function DeploySection() {
  const [update, schedule] = await Promise.all([checkForUpdate(), getDeploySchedule()]);
  const available = update.state === "update_available" ? update : null;
  const asProps = (d: { ref: string; at: Date; sha: string }) => ({ ref: d.ref, at: d.at.toISOString(), sha: d.sha });
  return (
    <CardSection
      id="deploy"
      title="Deploy New App Version"
      description={
        <>
          Copies dev.garwinai.com (the <code>{DEV_BRANCH}</code> branch) to garwinai.com (the <code>{LIVE_BRANCH}</code> branch). The
          live site updates when its build finishes, usually within a few minutes.
        </>
      }
    >
      {available && (
        <div className="mb-5 text-sm">
          <p className="font-medium">
            {available.count} change{available.count === 1 ? "" : "s"} waiting · version {shortSha(available.devSha)}
          </p>
          {available.changes.length > 0 && (
            <ul className="mt-2 list-inside list-disc space-y-0.5 text-neutral-700">
              {available.changes.map((c) => (
                <li key={c.sha} className="break-words">{c.summary}</li>
              ))}
              {available.count > available.changes.length && (
                <li className="list-none text-neutral-500">and {available.count - available.changes.length} more</li>
              )}
            </ul>
          )}
        </div>
      )}
      {!schedule.ok && <p className="mb-3 text-sm text-neutral-600">Couldn&apos;t load scheduled deploys from GitHub right now.</p>}
      <DeployPanel
        devSha={available?.devSha ?? null}
        blockedReason={updateBlockedReason(update)}
        scheduled={schedule.scheduled ? asProps(schedule.scheduled) : null}
        failed={schedule.failed.map(asProps)}
      />
    </CardSection>
  );
}
