import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { getEntitlements } from "@/server/services/entitlements";
import { CardSection } from "@/components/ui/card";
import { ProfileForm } from "./profile-form";

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
    </>
  );
}
