import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { isAppError } from "@/lib/errors";
import { PLAN_SPEC, isPlanId } from "@/lib/plans";
import { REMOTE_VIEW_MINUTES } from "@/lib/remote-view";
import { STATUS_LABELS, STATUS_TONES } from "@/lib/user-status";
import { uuidSchema } from "@/lib/validation";
import { getAdminUser } from "@/server/services/admin-users";
import { eventsForUser } from "@/server/services/console";
import { PageBody, PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CardSection } from "@/components/ui/card";
import { LocalTime } from "@/components/ui/local-time";
import { UserActions } from "../user-actions";
import { EditUserForm, RemoteViewForm } from "./forms";

export const metadata: Metadata = { title: "User · Admin" };

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  let user;
  try {
    user = await getAdminUser(admin, id);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  const events = await eventsForUser(admin, id);
  const isSelf = id === admin.id;
  const plan = isPlanId(user.plan) ? PLAN_SPEC[user.plan].name : user.plan;

  return (
    <>
      <PageHeader
        title={user.name}
        description={user.email}
        actions={
          <ButtonLink href="/admin#users" variant="secondary">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All users
          </ButtonLink>
        }
      />
      <PageBody>
        <CardSection id="details" title="Details" actions={<UserActions userId={user.id} name={user.name} status={user.status} isSelf={isSelf} />}>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-[160px_1fr] sm:gap-y-3">
            <dt className="text-neutral-500">Status</dt>
            <dd className="mb-2 sm:mb-0">
              <Badge tone={STATUS_TONES[user.status]}>{STATUS_LABELS[user.status]}</Badge>
              {user.statusChangedAt && (
                <span className="ml-2 text-neutral-500">since <LocalTime iso={new Date(user.statusChangedAt).toISOString()} /></span>
              )}
            </dd>
            <dt className="text-neutral-500">Role</dt>
            <dd className="mb-2 capitalize sm:mb-0">{user.role}</dd>
            <dt className="text-neutral-500">Plan (own workspace)</dt>
            <dd className="mb-2 sm:mb-0">{plan}</dd>
            <dt className="text-neutral-500">Team</dt>
            <dd className="mb-2 sm:mb-0">
              {user.teamSize > 0 ? `Host of ${user.teamSize} team member${user.teamSize === 1 ? "" : "s"}` : "No team members"}
              {user.isTeamMember && " · also a team member elsewhere"}
            </dd>
            <dt className="text-neutral-500">Email verified</dt>
            <dd className="mb-2 sm:mb-0">{user.emailVerifiedAt ? "Yes" : "Not yet"}</dd>
            <dt className="text-neutral-500">Joined</dt>
            <dd>
              <LocalTime iso={user.createdAt.toISOString()} />
            </dd>
          </dl>
        </CardSection>

        <CardSection id="edit" title="Edit" description="Name, email, role and a private note.">
          <EditUserForm user={user} isSelf={isSelf} />
        </CardSection>

        {!isSelf && (
          <CardSection id="remote-view" title="Remote view" description="See their account the way they do, with their permission.">
            <RemoteViewForm userId={user.id} name={user.name} minutes={REMOTE_VIEW_MINUTES} />
          </CardSection>
        )}

        <CardSection id="activity" title="Recent activity">
          {events.length === 0 ? (
            <p className="text-sm text-neutral-500">Nothing yet.</p>
          ) : (
            <ul className="divide-y divide-neutral-100 text-sm">
              {events.map((e) => (
                <li key={e.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>{e.text}</span>
                  <span className="text-neutral-500"><LocalTime iso={e.at} /></span>
                </li>
              ))}
            </ul>
          )}
        </CardSection>
      </PageBody>
    </>
  );
}
