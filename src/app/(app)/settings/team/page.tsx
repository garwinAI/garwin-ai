import type { Metadata } from "next";
import { Users } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { listTeam, DEFAULT_MEMBER_PERMISSIONS } from "@/server/services/team";
import { CardSection } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { LocalTime } from "@/components/ui/local-time";
import { EmptyState } from "@/components/ui/empty-state";
import { InviteForm, LeaveTeamButton, MemberPermissionsForm, MessageMemberButton, PendingInviteActions, RemoveMemberButton } from "./team-forms";

export const metadata: Metadata = { title: "Team" };

export default async function TeamSettings() {
  const user = await requireUser();
  const team = await listTeam(user);
  const limit = team.plan.teamMemberLimit;

  if (team.isHost && limit === 0) {
    return (
      <CardSection id="team-upgrade" title="Team" description="Invite people to share your storage, apps and messages.">
        <EmptyState
          icon={Users}
          title={`The ${team.plan.name} plan doesn't include team members`}
          body="Starter includes 1 team member, Plus 3, and Pro 10. Your team shares your storage and apps, and you choose exactly what each person can do."
          action={<ButtonLink href="/settings/payments">See plans</ButtonLink>}
        />
      </CardSection>
    );
  }

  const others = team.members.filter((m) => m.userId !== user.id);

  return (
    <>
      {team.isHost && (
        <CardSection
          id="invite"
          title="Invite a team member"
          description={`${team.seatsUsed} of ${limit} seat${limit === 1 ? "" : "s"} used on ${team.plan.name} (pending invitations count). Your team shares your ${team.plan.storageGb} GB.`}
        >
          {team.seatsUsed >= limit && (
            <p className="mb-4 text-sm text-neutral-600">
              All seats are in use. Remove someone, cancel a pending invitation, or <a href="/settings/payments" className="font-medium text-brand-600 hover:underline">upgrade</a> for more.
            </p>
          )}
          <InviteForm smsAvailable={team.smsAvailable} defaults={DEFAULT_MEMBER_PERMISSIONS} full={team.seatsUsed >= limit} />
        </CardSection>
      )}

      <CardSection id="members" title="Team members" description={team.isHost ? "Choose exactly what each person can do. Changes apply immediately." : "People in this workspace."}>
        <ul className="divide-y divide-neutral-100" aria-label="Team members">
          {team.members.map((m) => (
            <li key={m.memberId} className="py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {m.name}
                    {m.role === "owner" ? <Badge tone="brand">Host</Badge> : <Badge>Member</Badge>}
                    {m.userId === user.id && <Badge tone="accent">You</Badge>}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {m.email} · joined <LocalTime iso={m.joinedAt.toISOString()} />
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {m.userId !== user.id && <MessageMemberButton userId={m.userId} name={m.name} />}
                  {team.isHost && m.role === "member" && <RemoveMemberButton memberId={m.memberId} name={m.name} />}
                </div>
              </div>
              {team.isHost && m.role === "member" && (
                <MemberPermissionsForm memberId={m.memberId} name={m.name} granted={m.permissions} />
              )}
            </li>
          ))}
        </ul>
        {!team.isHost && others.length === 0 && <p className="text-sm text-neutral-500">No one else is here yet.</p>}
      </CardSection>

      {team.isHost && team.pending.length > 0 && (
        <CardSection id="pending" title="Pending invitations" description="Links expire after 7 days and work once.">
          <ul className="divide-y divide-neutral-100" aria-label="Pending invitations">
            {team.pending.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="text-sm">
                  <p className="font-medium">{p.email ?? p.phone}</p>
                  <p className="text-xs text-neutral-500">
                    By {p.channel === "email" ? "email" : "text message"} · expires <LocalTime iso={p.expiresAt.toISOString()} />
                  </p>
                </div>
                <PendingInviteActions invitationId={p.id} />
              </li>
            ))}
          </ul>
        </CardSection>
      )}

      {!team.isHost && (
        <CardSection id="leave" title="Leave this team" description="You'll lose access to this workspace. Your own workspace isn't affected.">
          <LeaveTeamButton />
        </CardSection>
      )}
    </>
  );
}
